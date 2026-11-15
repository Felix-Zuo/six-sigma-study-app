package com.findjob.sixsigmastudy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Collections;
import java.util.Set;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class AppUpdateValidationTest {
    private static final Set<String> TRUSTED = Collections.singleton("https://fly-view-personal.vercel.app:443");
    private static final String ABC_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    @Rule public TemporaryFolder folder = new TemporaryFolder();

    @Test public void acceptsJsonIntegerAndLongWithoutAcceptingFractions() {
        assertEquals(901L, AppUpdateValidation.positiveJsonInteger(Integer.valueOf(901)));
        assertEquals(41831873L, AppUpdateValidation.positiveJsonInteger(Integer.valueOf(41831873)));
        assertEquals(3000000000L, AppUpdateValidation.positiveJsonInteger(Long.valueOf(3000000000L)));
        assertEquals(901L, AppUpdateValidation.positiveJsonInteger(Double.valueOf(901)));
        assertEquals(0L, AppUpdateValidation.positiveJsonInteger(Double.valueOf(901.5)));
        assertEquals(0L, AppUpdateValidation.positiveJsonInteger("901"));
        assertEquals(0L, AppUpdateValidation.positiveJsonInteger(Double.NaN));
        assertEquals(0L, AppUpdateValidation.positiveJsonInteger(-1));
    }

    @Test public void acceptsTrustedHttpsOrigin() throws Exception {
        assertEquals("/downloads/fly-view.apk", AppUpdateValidation.trustedUrl("https://fly-view-personal.vercel.app/downloads/fly-view.apk", TRUSTED).getPath());
    }

    @Test public void rejectsOriginConfusionAndInsecureUrls() {
        String[] rejected = {
            "http://fly-view-personal.vercel.app/app.apk",
            "https://fly-view-personal.vercel.app.evil.example/app.apk",
            "https://fly-view-personal.vercel.app@evil.example/app.apk",
            "https://user@fly-view-personal.vercel.app/app.apk",
            "https://fly-view-personal.vercel.app:444/app.apk",
            "https://fly-view-personal.vercel.app/app.apk#ignored",
            "https://fly-view-personal.vercel.app/app.apk?token=private",
            "file:///tmp/app.apk"
        };
        for (String url : rejected) assertThrows(Exception.class, () -> AppUpdateValidation.trustedUrl(url, TRUSTED));
    }

    @Test public void unconfiguredUpdaterFailsClosed() {
        assertThrows(Exception.class, () -> AppUpdateValidation.trustedUrl("https://fly-view-personal.vercel.app/app.apk", Collections.emptySet()));
    }

    private File sample() throws Exception {
        File file = folder.newFile();
        Files.write(file.toPath(), "abc".getBytes(StandardCharsets.UTF_8));
        return file;
    }

    @Test public void verifiesExpectedBytes() throws Exception {
        AppUpdateValidation.verifyFileBytes(sample(), 3, ABC_HASH, () -> false);
    }

    @Test public void rejectsTruncationAndTampering() throws Exception {
        File file = sample();
        assertThrows(Exception.class, () -> AppUpdateValidation.verifyFileBytes(file, 4, ABC_HASH, () -> false));
        Files.write(file.toPath(), "abd".getBytes(StandardCharsets.UTF_8));
        assertThrows(Exception.class, () -> AppUpdateValidation.verifyFileBytes(file, 3, ABC_HASH, () -> false));
    }

    @Test public void stopsVerificationAfterCancellation() throws Exception {
        File file = sample();
        assertThrows(Exception.class, () -> AppUpdateValidation.verifyFileBytes(file, 3, ABC_HASH, () -> true));
    }
}
