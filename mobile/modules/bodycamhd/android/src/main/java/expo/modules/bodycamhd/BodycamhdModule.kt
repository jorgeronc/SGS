package expo.modules.bodycamhd

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class BodycamhdModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("Bodycamhd")

    Events("onSegment", "onError")

    // Inicia la grabación HD segmentada (3 min) en el foreground service.
    AsyncFunction("start") { promise: Promise ->
      val ctx = appContext.reactContext ?: run { promise.reject("no_ctx", "Sin contexto", null); return@AsyncFunction }

      BodycamRecordingService.onSegment = { uri, dur ->
        sendEvent("onSegment", mapOf("uri" to uri, "durationMs" to dur))
      }
      BodycamRecordingService.onError = { msg ->
        sendEvent("onError", mapOf("message" to msg))
      }

      val intent = Intent(ctx, BodycamRecordingService::class.java).apply {
        action = BodycamRecordingService.ACTION_START
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent)
      else ctx.startService(intent)
      promise.resolve(true)
    }

    // Detiene la grabación; el resultado llega por el evento onFinish.
    AsyncFunction("stop") { promise: Promise ->
      val ctx = appContext.reactContext ?: run { promise.reject("no_ctx", "Sin contexto", null); return@AsyncFunction }
      val intent = Intent(ctx, BodycamRecordingService::class.java).apply {
        action = BodycamRecordingService.ACTION_STOP
      }
      ctx.startService(intent)
      promise.resolve(true)
    }

    Function("isRecording") {
      BodycamRecordingService.isRecording
    }
  }
}
