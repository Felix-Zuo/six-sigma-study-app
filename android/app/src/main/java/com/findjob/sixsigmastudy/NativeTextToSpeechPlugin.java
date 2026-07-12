package com.findjob.sixsigmastudy;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "NativeTextToSpeech")
public class NativeTextToSpeechPlugin extends Plugin {

    private TextToSpeech textToSpeech;
    private boolean ready;
    private boolean initializing;
    private final List<PluginCall> pendingCalls = new ArrayList<>();

    @Override
    public void load() {
        initializeEngine();
    }

    private void initializeEngine() {
        if (ready || initializing) {
            return;
        }
        initializing = true;
        getActivity().runOnUiThread(() -> textToSpeech = new TextToSpeech(getContext(), status -> {
            initializing = false;
            ready = status == TextToSpeech.SUCCESS;
            List<PluginCall> queued = new ArrayList<>(pendingCalls);
            pendingCalls.clear();
            if (!ready) {
                for (PluginCall call : queued) {
                    call.reject("Android 文字转语音引擎初始化失败，请在系统设置中安装或启用语音服务");
                }
                return;
            }
            for (PluginCall call : queued) {
                performSpeak(call);
            }
        }));
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.reject("没有可播放的文本");
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (!ready) {
                pendingCalls.add(call);
                initializeEngine();
                return;
            }
            performSpeak(call);
        });
    }

    private void performSpeak(PluginCall call) {
        String text = call.getString("text", "").trim();
        String localeTag = call.getString("locale", "en-US");
        Double requestedRate = call.getDouble("rate", 0.84);
        Locale locale = Locale.forLanguageTag(localeTag);
        int availability = textToSpeech.setLanguage(locale);
        if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) {
            call.reject("系统英语语音数据不可用，请在系统文字转语音设置中安装英语语音包");
            return;
        }
        textToSpeech.setSpeechRate(requestedRate.floatValue());
        textToSpeech.setPitch(1.0f);
        Bundle params = new Bundle();
        int result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, params, UUID.randomUUID().toString());
        if (result == TextToSpeech.ERROR) {
            call.reject("系统发音引擎未能开始播放");
            return;
        }
        JSObject response = new JSObject();
        response.put("engine", textToSpeech.getDefaultEngine());
        response.put("locale", locale.toLanguageTag());
        call.resolve(response);
    }

    @Override
    protected void handleOnDestroy() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        ready = false;
    }
}
