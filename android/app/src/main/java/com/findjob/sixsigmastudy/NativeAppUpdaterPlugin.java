package com.findjob.sixsigmastudy;

import android.content.ClipData;
import android.content.Intent;
import android.content.Context;
import android.app.Activity;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.core.content.FileProvider;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Sideload updates are verified here, then handed to Android's user-confirmed installer. */
@CapacitorPlugin(name = "NativeAppUpdater")
public class NativeAppUpdaterPlugin extends Plugin {
    private static final long MAX_BYTES = 512L * 1024L * 1024L;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private final AtomicBoolean exportingBackup = new AtomicBoolean(false);
    private final Set<String> trustedOrigins = new HashSet<>();
    private volatile HttpsURLConnection activeDownload;
    private volatile VerifiedDownload verified;
    private final Object connectionLock = new Object();
    private static final String CONNECTION_ALIAS = "fly_view_connection_v1";
    private static final String CONNECTION_PREFS = "fly_view_connection";

    private static final class VerifiedDownload {
        final File file;
        final long size;
        final String sha256;
        final long versionCode;
        VerifiedDownload(File file, long size, String sha256, long versionCode) {
            this.file = file; this.size = size; this.sha256 = sha256; this.versionCode = versionCode;
        }
    }

    @Override
    public void load() {
        for (String configured : getConfig().getArray("trustedOrigins", new String[0])) {
            try { trustedOrigins.add(origin(new URL(configured))); } catch (Exception ignored) { /* Invalid configuration fails closed. */ }
        }
    }

    private static String origin(URL url) throws Exception {
        return AppUpdateValidation.origin(url);
    }

    private URL trustedUrl(String value) throws Exception {
        return AppUpdateValidation.trustedUrl(value, trustedOrigins);
    }

    private HttpsURLConnection connect(String address, boolean download) throws Exception {
        URL url = trustedUrl(address);
        for (int redirects = 0; redirects <= 3; redirects++) {
            if (download && cancelled.get()) throw new IOException("下载已取消。");
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            if (download) activeDownload = connection;
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Cache-Control", "no-cache");
            try {
                String authorization = authorizationFor(url, download);
                if (authorization != null) connection.setRequestProperty("Authorization", authorization);
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    connection.disconnect();
                    if (location == null || redirects == 3) throw new IOException("更新服务重定向异常。");
                    url = trustedUrl(new URL(url, location).toString());
                    continue;
                }
                if (status == 401 || status == 403) throw new IOException("个人空间连接已失效，请重新配对后再更新。");
                if (status != 200) throw new IOException(status == 404 ? "更新服务尚未发布此版本，请稍后再试。" : "更新服务暂时不可用，请稍后重试。");
                return connection;
            } catch (Exception error) {
                connection.disconnect();
                throw error;
            }
        }
        throw new IOException("更新地址不可用。");
    }

    @SuppressWarnings("deprecation")
    private PackageInfo installedPackage() throws PackageManager.NameNotFoundException {
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), flags);
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static String[] certificateHashes(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28
            ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        if (signatures == null || signatures.length == 0) throw new IOException("无法验证安装包签名。");
        String[] hashes = new String[signatures.length];
        for (int i = 0; i < signatures.length; i++) hashes[i] = hex(MessageDigest.getInstance("SHA-256").digest(signatures[i].toByteArray()));
        Arrays.sort(hashes);
        return hashes;
    }

    @SuppressWarnings("deprecation")
    private void verifyPackage(File file, long expectedVersion) throws Exception {
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo candidate = getContext().getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), flags);
        PackageInfo installed = installedPackage();
        if (candidate == null || !getContext().getPackageName().equals(candidate.packageName)) throw new IOException("安装包不是飞阅应用，已停止更新。");
        if (versionCode(candidate) != expectedVersion || expectedVersion <= versionCode(installed)) throw new IOException("安装包版本与更新信息不符，或不是更新版本。");
        if (!Arrays.equals(certificateHashes(installed), certificateHashes(candidate))) throw new IOException("安装包签名与当前应用不一致，已停止更新。");
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte item : bytes) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return result.toString();
    }

    private void verifyFile(VerifiedDownload candidate) throws Exception {
        AppUpdateValidation.verifyFileBytes(candidate.file, candidate.size, candidate.sha256, cancelled::get);
        verifyPackage(candidate.file, candidate.versionCode);
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            PackageInfo installed = installedPackage();
            JSObject result = new JSObject();
            result.put("version", installed.versionName);
            result.put("versionCode", versionCode(installed));
            result.put("configured", !trustedOrigins.isEmpty());
            result.put("canInstall", canInstall());
            result.put("ready", verified != null && verified.file.isFile());
            call.resolve(result);
        } catch (Exception error) { call.reject("无法读取当前应用版本。"); }
    }

    private SecretKey connectionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(CONNECTION_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(CONNECTION_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(CONNECTION_ALIAS, null);
    }

    private JSONObject readConnection() throws Exception {
        synchronized (connectionLock) {
            String stored = getContext().getSharedPreferences(CONNECTION_PREFS, Context.MODE_PRIVATE).getString("connection", null);
            if (stored == null) return null;
            JSONObject encrypted = new JSONObject(stored);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, connectionKey(), new GCMParameterSpec(128, Base64.decode(encrypted.getString("iv"), Base64.NO_WRAP)));
            byte[] plaintext = cipher.doFinal(Base64.decode(encrypted.getString("ciphertext"), Base64.NO_WRAP));
            return new JSONObject(new String(plaintext, StandardCharsets.UTF_8));
        }
    }

    private String authorizationFor(URL target, boolean required) throws Exception {
        JSONObject saved = readConnection();
        if (saved != null && origin(target).equals(origin(trustedUrl(saved.getString("endpoint"))))) {
            String token = saved.getString("token");
            if (token.length() >= 16 && token.length() <= 4096 && !token.matches("(?s).*\\s.*")) return "Bearer " + token;
        }
        if (required) throw new IOException("请先连接个人空间，再下载安装包。");
        return null;
    }

    @PluginMethod
    public void saveConnection(PluginCall call) {
        String endpoint = call.getString("endpoint", "").trim().replaceAll("/+$", "");
        String token = call.getString("token", "").trim();
        executor.execute(() -> {
            synchronized (connectionLock) {
                try {
                    URL url = trustedUrl(endpoint);
                    if (url.getQuery() != null || token.length() < 16 || token.length() > 4096 || token.matches("(?s).*\\s.*")) throw new IOException("连接信息无效，请重新配对。");
                    JSONObject plain = new JSONObject(); plain.put("endpoint", endpoint); plain.put("token", token);
                    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                    cipher.init(Cipher.ENCRYPT_MODE, connectionKey());
                    byte[] ciphertext = cipher.doFinal(plain.toString().getBytes(StandardCharsets.UTF_8));
                    JSONObject encrypted = new JSONObject();
                    encrypted.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
                    encrypted.put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
                    boolean stored = getContext().getSharedPreferences(CONNECTION_PREFS, Context.MODE_PRIVATE).edit().putString("connection", encrypted.toString()).commit();
                    if (!stored) throw new IOException("无法保存连接信息，请重试。");
                    call.resolve();
                } catch (Exception error) { call.reject("连接信息未保存，请检查服务地址或重新配对。"); }
            }
        });
    }

    @PluginMethod
    public void getConnection(PluginCall call) {
        executor.execute(() -> {
            synchronized (connectionLock) {
                try {
                    JSObject result = new JSObject();
                    JSONObject saved = readConnection();
                    result.put("connection", saved == null ? JSONObject.NULL : saved);
                    call.resolve(result);
                } catch (Exception error) { call.reject("无法读取已保存的连接，请重新配对。"); }
            }
        });
    }

    @PluginMethod
    public void clearConnection(PluginCall call) {
        executor.execute(() -> {
            synchronized (connectionLock) {
                try {
                    if (!getContext().getSharedPreferences(CONNECTION_PREFS, Context.MODE_PRIVATE).edit().remove("connection").commit()) throw new IOException();
                    KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
                    if (store.containsAlias(CONNECTION_ALIAS)) store.deleteEntry(CONNECTION_ALIAS);
                    call.resolve();
                } catch (Exception error) { call.reject("无法清除连接信息，请重试。"); }
            }
        });
    }

    @PluginMethod
    public void exportBackup(PluginCall call) {
        if (!exportingBackup.compareAndSet(false, true)) { call.reject("已有备份正在保存，请先完成或取消。"); return; }
        executor.execute(() -> {
            File staged = null;
            try {
                String filename = BackupExportValidation.fileName(call.getString("fileName"));
                byte[] bytes = BackupExportValidation.bytes(call.getString("json"));
                File directory = new File(getContext().getCacheDir(), "fly-view-backups");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法准备备份文件，请检查手机剩余空间。");
                staged = new File(directory, "backup-" + UUID.randomUUID() + ".json");
                try (FileOutputStream output = new FileOutputStream(staged)) { output.write(bytes); output.getFD().sync(); }
                // Capacitor persists activity-call arguments when Android recreates the app.
                // Keep only a private temporary-file identifier, never the potentially 20 MB body.
                call.getData().remove("json");
                call.getData().put("backupTemp", staged.getName());
                File stagedFile = staged;
                getActivity().runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("application/json");
                        intent.putExtra(Intent.EXTRA_TITLE, filename);
                        startActivityForResult(call, intent, "backupDocumentSelected");
                    } catch (Exception error) {
                        stagedFile.delete(); exportingBackup.set(false);
                        call.reject("无法打开系统保存页面，请稍后重试。");
                    }
                });
            } catch (Exception error) {
                if (staged != null) staged.delete();
                exportingBackup.set(false);
                call.reject(error instanceof IOException ? error.getMessage() : "无法准备备份，请稍后重试。");
            }
        });
    }

    @ActivityCallback
    private void backupDocumentSelected(PluginCall call, ActivityResult activityResult) {
        if (call == null) { exportingBackup.set(false); return; }
        String temporaryName = call.getString("backupTemp", "");
        if (!temporaryName.matches("backup-[a-f0-9-]{36}\\.json")) {
            exportingBackup.set(false); call.reject("备份已中断，请重新导出。"); return;
        }
        File staged = new File(new File(getContext().getCacheDir(), "fly-view-backups"), temporaryName);
        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            staged.delete(); exportingBackup.set(false);
            JSObject result = new JSObject(); result.put("saved", false); call.resolve(result); return;
        }
        Uri destination = activityResult.getData() == null ? null : activityResult.getData().getData();
        if (destination == null || !"content".equals(destination.getScheme())) {
            staged.delete(); exportingBackup.set(false); call.reject("系统没有返回有效的保存位置，请重新导出。"); return;
        }
        executor.execute(() -> {
            try {
                if (!staged.isFile() || staged.length() == 0 || staged.length() > BackupExportValidation.MAX_BYTES) throw new IOException("备份临时文件不可用，请重新导出。");
                try (InputStream input = new FileInputStream(staged);
                     OutputStream output = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new IOException("无法写入所选位置，请选择其他目录。");
                    byte[] buffer = new byte[65536];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    output.flush();
                }
                JSObject result = new JSObject(); result.put("saved", true); call.resolve(result);
            } catch (Exception error) {
                call.reject("备份未能完整保存，请选择其他位置重新导出。本机学习数据没有改变。");
            } finally { staged.delete(); exportingBackup.set(false); }
        });
    }

    @PluginMethod
    public void getRelease(PluginCall call) {
        String url = call.getString("url", "");
        executor.execute(() -> {
            HttpsURLConnection connection = null;
            try {
                connection = connect(url, false);
                String contentType = connection.getContentType();
                if (contentType == null || !contentType.toLowerCase(Locale.ROOT).contains("application/json")) throw new IOException("更新服务返回了无效内容。");
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (output.size() + read > 131072) throw new IOException("更新信息超过允许大小。");
                        output.write(buffer, 0, read);
                    }
                    JSObject result = new JSObject();
                    result.put("responseJson", new String(output.toByteArray(), StandardCharsets.UTF_8));
                    call.resolve(result);
                }
            } catch (Exception error) { call.reject(error instanceof IOException ? error.getMessage() : "暂时无法获取更新，请检查服务地址和网络。"); }
            finally { if (connection != null) connection.disconnect(); }
        });
    }

    private void progress(String stage, long received, long total) {
        JSObject event = new JSObject();
        event.put("stage", stage); event.put("received", received); event.put("total", total);
        event.put("percent", total > 0 ? Math.min(100, (int) (received * 100 / total)) : 0);
        notifyListeners("updateProgress", event);
    }

    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        if (!downloading.compareAndSet(false, true)) { call.reject("已有更新正在下载。"); return; }
        cancelled.set(false);
        verified = null;
        String address = call.getString("apkUrl", "");
        String expectedHash = call.getString("sha256", "").toLowerCase(Locale.ROOT);
        // JSONObject uses Integer for ordinary version codes and APK sizes;
        // PluginCall.getLong silently returns its default for those values.
        long expectedSize = AppUpdateValidation.positiveJsonInteger(call.getData().opt("size"));
        long expectedVersion = AppUpdateValidation.positiveJsonInteger(call.getData().opt("versionCode"));
        executor.execute(() -> {
            File partial = null;
            File complete = null;
            HttpsURLConnection connection = null;
            boolean succeeded = false;
            String failureMessage = null;
            try {
                if (expectedSize <= 0 || expectedSize > MAX_BYTES || !expectedHash.matches("[a-f0-9]{64}") || expectedVersion <= versionCode(installedPackage())) throw new IOException("更新信息无效，或已经是当前版本。");
                trustedUrl(address);
                File directory = new File(getContext().getCacheDir(), "fly-view-updates");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("无法创建更新目录。");
                if (directory.getUsableSpace() < expectedSize + 10 * 1024 * 1024) throw new IOException("手机存储空间不足，请清理后重试。");
                partial = new File(directory, "update.part");
                complete = new File(directory, "update.apk");
                if (complete.exists() && !complete.delete()) throw new IOException("无法清理上次的安装包，请重启应用后重试。");
                connection = connect(address, true);
                long declaredLength = connection.getContentLengthLong();
                if (declaredLength >= 0 && declaredLength != expectedSize) throw new IOException("安装包大小与更新信息不符。");
                long received = 0;
                long lastProgress = 0;
                progress("downloading", 0, expectedSize);
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[65536];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (cancelled.get()) throw new IOException("下载已取消。");
                        received += read;
                        if (received > expectedSize) throw new IOException("安装包超过声明大小，已停止下载。");
                        output.write(buffer, 0, read);
                        long now = System.currentTimeMillis();
                        if (now - lastProgress >= 200) { progress("downloading", received, expectedSize); lastProgress = now; }
                    }
                    output.getFD().sync();
                }
                if (cancelled.get()) throw new IOException("下载已取消。");
                progress("verifying", received, expectedSize);
                verifyFile(new VerifiedDownload(partial, expectedSize, expectedHash, expectedVersion));
                if (cancelled.get()) throw new IOException("下载已取消。");
                if (!partial.renameTo(complete)) throw new IOException("保存安装包失败，请重试。");
                verified = new VerifiedDownload(complete, expectedSize, expectedHash, expectedVersion);
                succeeded = true;
                progress("ready", expectedSize, expectedSize);
            } catch (Exception error) {
                failureMessage = cancelled.get() ? "下载已取消。" : error instanceof IOException ? error.getMessage() : "下载或验证失败，请检查网络后重试。";
            } finally {
                if (connection != null) connection.disconnect();
                activeDownload = null;
                if (partial != null && partial.exists()) partial.delete();
                if (!succeeded && complete != null && complete.exists()) complete.delete();
                downloading.set(false);
            }
            if (succeeded) { JSObject result = new JSObject(); result.put("versionCode", expectedVersion); call.resolve(result); }
            else call.reject(failureMessage == null ? "下载未完成，请重试。" : failureMessage);
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled.set(true);
        HttpsURLConnection connection = activeDownload;
        if (connection != null) connection.disconnect();
        call.resolve();
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        VerifiedDownload candidate = verified;
        if (candidate == null || downloading.get()) { call.reject("请先完成安装包下载。"); return; }
        executor.execute(() -> {
            try {
                verifyFile(candidate);
                getActivity().runOnUiThread(() -> {
                    try {
                        if (cancelled.get()) throw new IOException("下载已取消。");
                        JSObject result = new JSObject();
                        if (!canInstall()) {
                            Intent permission = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                            getActivity().startActivity(permission);
                            result.put("status", "permission-required");
                        } else {
                            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", candidate.file);
                            Intent installer = new Intent(Intent.ACTION_VIEW);
                            installer.setDataAndType(uri, "application/vnd.android.package-archive");
                            installer.setClipData(ClipData.newRawUri("Fly View update", uri));
                            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            getActivity().startActivity(installer);
                            result.put("status", "installer-opened");
                        }
                        call.resolve(result);
                    } catch (Exception error) { call.reject("无法打开系统安装页面，请检查设备安装权限后重试。"); }
                });
            } catch (Exception error) { verified = null; call.reject(error instanceof IOException ? error.getMessage() : "安装包验证失败，请重新下载。"); }
        });
    }

    @Override
    protected void handleOnDestroy() {
        cancelled.set(true);
        HttpsURLConnection connection = activeDownload;
        if (connection != null) connection.disconnect();
        executor.shutdownNow();
    }
}
