package com.findjob.sixsigmastudy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class BackupExportValidationTest {
    @Test public void acceptsChineseFilenameAndUtf8Body() throws Exception {
        assertEquals("FlyView-学习备份.json", BackupExportValidation.fileName("FlyView-学习备份.json"));
        String json = "{\"text\":\"学习记录\"}";
        assertEquals(json, new String(BackupExportValidation.bytes(json), StandardCharsets.UTF_8));
    }

    @Test public void rejectsPathsAndNonJsonFilename() {
        for (String filename : new String[] { "../backup.json", "a\\backup.json", "back\nup.json", "backup.exe", "", "a:b.json" }) {
            final String candidate = filename;
            assertThrows(Exception.class, () -> BackupExportValidation.fileName(candidate));
        }
    }

    @Test public void limitsUtf8BytesNotOnlyCharacterCount() {
        String multibyte = "中".repeat(BackupExportValidation.MAX_BYTES / 3 + 1);
        assertThrows(Exception.class, () -> BackupExportValidation.bytes(multibyte));
        assertThrows(Exception.class, () -> BackupExportValidation.bytes(""));
        assertThrows(Exception.class, () -> BackupExportValidation.bytes(null));
    }
}
