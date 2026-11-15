package com.findjob.sixsigmastudy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

final class BackupExportValidation {
    static final int MAX_BYTES = 20 * 1024 * 1024;
    private BackupExportValidation() {}

    static byte[] bytes(String json) throws IOException {
        if (json == null || json.isEmpty() || json.length() > MAX_BYTES) throw new IOException("备份内容为空或超过 20 MB，请先减少资料数量。");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IOException("备份超过 20 MB，请先减少资料数量。");
        return bytes;
    }

    static String fileName(String input) throws IOException {
        String name = input == null ? "FlyView-learning-backup.json" : input.trim();
        if (name.isEmpty() || name.length() > 180 || name.matches("(?s).*[\\\\/:*?\"<>|\\p{Cntrl}].*") || !name.toLowerCase(Locale.ROOT).endsWith(".json")) {
            throw new IOException("备份文件名无效，请重新导出。");
        }
        return name;
    }
}
