package com.bektas.aurora;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Telefonun kendi Türkçe ses tanıma (SpeechRecognizer) ve metin okuma (TextToSpeech) motorları.
 * Ses tanıma yalnızca kullanıcı mikrofon düğmesine basınca, tek konuşma için çalışır.
 * Metin okuma her kelimenin başladığı anı (onRangeStart) bildirir; dudak senkronu buna göre yapılır.
 */
public class SpeechController {

    private final Context context;
    private final AuroraBridge bridge;
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile boolean turkishOk = false;
    private String pendingText, pendingId;
    private float pendingRate = 1f, pendingPitch = 1f;
    private long lastRms = 0;

    public SpeechController(Context context, AuroraBridge bridge) {
        this.context = context;
        this.bridge = bridge;
        tts = new TextToSpeech(context.getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                emit("tts", "error", null, "Metin okuma motoru başlatılamadı.");
                return;
            }
            int r = tts.setLanguage(new Locale("tr", "TR"));
            turkishOk = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { emit("tts", "start", id, null); }
                @Override public void onDone(String id) { emit("tts", "done", id, null); }
                @Override public void onError(String id) { emit("tts", "error", id, "Ses üretilemedi."); }
                @Override public void onError(String id, int code) { emit("tts", "error", id, "Ses üretilemedi (" + code + ")."); }
                @Override public void onStop(String id, boolean interrupted) { emit("tts", "done", id, null); }
                @Override public void onRangeStart(String id, int start, int end, int frame) {
                    try {
                        bridge.emit("tts", new JSONObject().put("event", "range").put("id", id).put("start", start).put("end", end));
                    } catch (Exception ignored) {
                    }
                }
            });
            ttsReady = true;
            if (pendingText != null) {
                String t = pendingText, i = pendingId;
                pendingText = null;
                speak(t, pendingRate, pendingPitch, i);
            }
        });
    }

    private void emit(String type, String event, String id, String message) {
        try {
            JSONObject o = new JSONObject().put("event", event);
            if (id != null) o.put("id", id);
            if (message != null) o.put("message", message);
            bridge.emit(type, o);
        } catch (Exception ignored) {
        }
    }

    // ---------------- Ses tanıma (ana iş parçacığında çağrılır) ----------------

    public void startListening(String language) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            asrError(5, "Bu telefonda ses tanıma servisi yok (Google uygulamasını kurun).");
            return;
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(context);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { asr("ready"); }
                @Override public void onBeginningOfSpeech() { asr("begin"); }
                @Override public void onRmsChanged(float rmsdB) {
                    long now = System.currentTimeMillis();
                    if (now - lastRms < 70) return;
                    lastRms = now;
                    try {
                        bridge.emit("asr", new JSONObject().put("event", "rms").put("value", rmsdB));
                    } catch (Exception ignored) {
                    }
                }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { asr("endOfSpeech"); }
                @Override public void onError(int error) { asrError(error, null); }
                @Override public void onResults(Bundle results) { asrText("result", results); }
                @Override public void onPartialResults(Bundle partialResults) { asrText("partial", partialResults); }
                @Override public void onEvent(int eventType, Bundle params) { }
            });
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language == null ? "tr-TR" : language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language == null ? "tr-TR" : language);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.getPackageName());
        recognizer.startListening(intent);
    }

    public void stopListening() {
        if (recognizer != null) recognizer.stopListening();
    }

    public void cancelListening() {
        if (recognizer != null) recognizer.cancel();
    }

    private void asr(String event) {
        emit("asr", event, null, null);
    }

    private void asrError(int code, String message) {
        try {
            JSONObject o = new JSONObject().put("event", "error").put("code", code);
            if (message != null) o.put("message", message);
            bridge.emit("asr", o);
        } catch (Exception ignored) {
        }
    }

    private void asrText(String event, Bundle b) {
        ArrayList<String> list = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String text = list != null && !list.isEmpty() ? list.get(0) : "";
        try {
            bridge.emit("asr", new JSONObject().put("event", event).put("text", text));
        } catch (Exception ignored) {
        }
    }

    // ---------------- Metin okuma ----------------

    public synchronized void speak(String text, float rate, float pitch, String id) {
        if (!ttsReady) {
            pendingText = text;
            pendingId = id;
            pendingRate = rate;
            pendingPitch = pitch;
            return;
        }
        if (!turkishOk) emit("tts", "warning", id, "Türkçe ses paketi yok: Ayarlar > Sistem > Diller > Metin okuma çıkışı.");
        int max = TextToSpeech.getMaxSpeechInputLength();
        String t = text.length() > max ? text.substring(0, max) : text;
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, id);
        tts.speak(t, TextToSpeech.QUEUE_FLUSH, params, id);
    }

    public void stopSpeaking() {
        pendingText = null;
        if (tts != null) tts.stop();
    }

    public void destroy() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
    }
}
