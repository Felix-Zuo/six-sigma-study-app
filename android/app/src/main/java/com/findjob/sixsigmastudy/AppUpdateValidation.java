package com.findjob.sixsigmastudy;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Set;
import java.util.function.BooleanSupplier;

/** Pure validation shared by the native downloader and its local JVM tests. */
final class AppUpdateValidation {
    private AppUpdateValidation() {}

    static long positiveJsonInteger(Object value) {
        if (!(value instanceof Number)) return 0;
        double numeric = ((Number) value).doubleValue();
        if (!Double.isFinite(numeric) || numeric < 1 || numeric != Math.floor(numeric) || numeric > 9007199254740991d) return 0;
        return ((Number) value).longValue();
    }

    static String origin(URL url) throws Exception {
        URI uri = url.toURI();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null) {
            throw new IOException("更新地址必须使用 HTTPS。");
        }
        int port = uri.getPort() == -1 ? 443 : uri.getPort();
        return "https://" + uri.getHost().toLowerCase(Locale.ROOT) + ":" + port;
    }

    static URL trustedUrl(String value, Set<String> trustedOrigins) throws Exception {
        URL url = new URL(value);
        if (url.getQuery() != null) throw new IOException("更新地址不能携带查询凭据。");
        if (!trustedOrigins.contains(origin(url))) throw new IOException("该地址不在本应用的可信更新服务中。");
        return url;
    }

    static void verifyFileBytes(File file, long size, String expectedHash, BooleanSupplier cancelled) throws Exception {
        if (!file.isFile() || file.length() != size) throw new IOException("安装包不完整，请重新下载。");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (cancelled.getAsBoolean()) throw new IOException("下载已取消。");
                digest.update(buffer, 0, read);
            }
        }
        StringBuilder actual = new StringBuilder();
        for (byte item : digest.digest()) actual.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        if (!actual.toString().equals(expectedHash)) throw new IOException("安装包校验失败，请重新下载。");
    }
}
