package com.findjob.sixsigmastudy;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeDeepSeekAssistant")
public class NativeDeepSeekAssistantPlugin extends Plugin {

    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "six_sigma_deepseek_key_v1";
    private static final String PREFS_NAME = "deepseek_secure_preferences";
    private static final String PREF_CIPHERTEXT = "api_key_ciphertext";
    private static final String PREF_IV = "api_key_iv";
    private static final String MODELS_URL = "https://api.deepseek.com/models";
    private static final String COMPLETIONS_URL = "https://api.deepseek.com/beta/chat/completions";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 45000;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private void encryptAndStore(String apiKey) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
        byte[] ciphertext = cipher.doFinal(apiKey.getBytes(StandardCharsets.UTF_8));
        preferences().edit()
            .putString(PREF_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .putString(PREF_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .apply();
    }

    private String readApiKey() throws Exception {
        String encrypted = preferences().getString(PREF_CIPHERTEXT, "");
        String encodedIv = preferences().getString(PREF_IV, "");
        if (encrypted.isEmpty() || encodedIv.isEmpty()) {
            return "";
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateSecretKey(),
            new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP))
        );
        byte[] plaintext = cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP));
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    private void clearStoredKey() throws Exception {
        preferences().edit().remove(PREF_CIPHERTEXT).remove(PREF_IV).apply();
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            keyStore.deleteEntry(KEY_ALIAS);
        }
    }

    private void resolve(PluginCall call, JSObject response) {
        getActivity().runOnUiThread(() -> call.resolve(response));
    }

    private void reject(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }

    @PluginMethod
    public void saveApiKey(PluginCall call) {
        String apiKey = call.getString("apiKey", "").trim();
        if (apiKey.length() < 12 || apiKey.matches(".*\\s+.*")) {
            call.reject("API Key 格式不正确");
            return;
        }
        try {
            encryptAndStore(apiKey);
            JSObject response = new JSObject();
            response.put("configured", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Android Keystore 无法保存 API Key");
        }
    }

    @PluginMethod
    public void getApiKeyStatus(PluginCall call) {
        JSObject response = new JSObject();
        try {
            response.put("configured", !readApiKey().isEmpty());
        } catch (Exception error) {
            response.put("configured", false);
        }
        call.resolve(response);
    }

    @PluginMethod
    public void clearApiKey(PluginCall call) {
        try {
            clearStoredKey();
            JSObject response = new JSObject();
            response.put("configured", false);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("无法清除 Android Keystore 中的 API Key");
        }
    }

    @PluginMethod
    public void testConnection(PluginCall call) {
        executor.execute(() -> {
            try {
                String apiKey = requireApiKey();
                String responseText = executeRequest("GET", MODELS_URL, null, apiKey);
                JSONObject payload = new JSONObject(responseText);
                JSONArray models = payload.optJSONArray("data");
                JSObject response = new JSObject();
                response.put("ok", true);
                response.put("modelCount", models == null ? 0 : models.length());
                resolve(call, response);
            } catch (Exception error) {
                reject(call, safeError(error));
            }
        });
    }

    @PluginMethod
    public void performRequest(PluginCall call) {
        String requestJson = call.getString("requestJson", "").trim();
        if (requestJson.isEmpty()) {
            call.reject("缺少 DeepSeek 请求内容");
            return;
        }
        try {
            JSONObject request = new JSONObject(requestJson);
            if (!"deepseek-v4-flash".equals(request.optString("model"))) {
                call.reject("仅允许使用 deepseek-v4-flash");
                return;
            }
        } catch (Exception error) {
            call.reject("DeepSeek 请求格式无效");
            return;
        }
        executor.execute(() -> {
            try {
                String apiKey = requireApiKey();
                String responseText = executeRequest("POST", COMPLETIONS_URL, requestJson, apiKey);
                JSObject response = new JSObject();
                response.put("responseJson", responseText);
                response.put("responseSha256", sha256(responseText));
                resolve(call, response);
            } catch (Exception error) {
                reject(call, safeError(error));
            }
        });
    }

    private String requireApiKey() throws Exception {
        String apiKey = readApiKey();
        if (apiKey.isEmpty()) {
            throw new IllegalStateException("请先在“我的”中配置 DeepSeek API Key");
        }
        return apiKey;
    }

    private String executeRequest(String method, String endpoint, String body, String apiKey) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + apiKey);
        if (body != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        String responseText = readStream(stream);
        connection.disconnect();
        if (status < 200 || status >= 300) {
            String detail = "HTTP " + status;
            try {
                String upstream = new JSONObject(responseText).optJSONObject("error").optString("message", "");
                if (!upstream.isEmpty()) {
                    detail += "：" + upstream;
                }
            } catch (Exception ignored) {
                // Arbitrary upstream HTML is intentionally not exposed.
            }
            throw new IllegalStateException("DeepSeek 请求失败：" + detail);
        }
        return responseText;
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private String sha256(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte item : digest) {
            hex.append(String.format("%02x", item));
        }
        return hex.toString();
    }

    private String safeError(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return "DeepSeek 服务暂时不可用";
        }
        return message.length() > 240 ? message.substring(0, 240) : message;
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
    }
}
