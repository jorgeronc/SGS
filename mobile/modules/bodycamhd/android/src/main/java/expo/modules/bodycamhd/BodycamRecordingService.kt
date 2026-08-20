package expo.modules.bodycamhd

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import java.io.File

// Foreground service que graba video HD con CameraX en SEGMENTOS de 3 min. Los
// archivos quedan en el teléfono (bodycam/pending) y se suben después desde
// Perfil ("Descargar bodycam"), idealmente en WiFi. Sigue grabando con la
// pantalla apagada / app en segundo plano (bodycam manos libres).
class BodycamRecordingService : LifecycleService() {

  private var recording: Recording? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var userStopping = false
  private val rotateHandler = Handler(Looper.getMainLooper())
  private val rotateRunnable = Runnable { try { recording?.stop() } catch (_: Exception) {} }

  companion object {
    const val ACTION_START = "expo.modules.bodycamhd.START"
    const val ACTION_STOP = "expo.modules.bodycamhd.STOP"
    const val CHANNEL_ID = "bodycam_hd"
    const val NOTIF_ID = 7412
    const val SEGMENT_MS = 5L * 60L * 1000L         // tope de tiempo (respaldo)
    const val SEGMENT_BYTES = 45L * 1024L * 1024L   // ~45 MB: rota por tamaño (bajo el límite de 50 MB)

    @Volatile var isRecording = false
    // El módulo registra este callback: se invoca al finalizar CADA segmento.
    var onSegment: ((uri: String, durationMs: Long) -> Unit)? = null
    var onError: ((message: String) -> Unit)? = null
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    super.onStartCommand(intent, flags, startId)
    when (intent?.action) {
      ACTION_START -> { userStopping = false; startForegroundNotif(); iniciarCamara() }
      ACTION_STOP -> {
        userStopping = true
        rotateHandler.removeCallbacks(rotateRunnable)
        try { recording?.stop() } catch (_: Exception) { stopSelf() }
      }
    }
    return START_NOT_STICKY
  }

  private fun startForegroundNotif() {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Bodycam en grabación", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pi = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE)
    val notif = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("🔴 Bodycam grabando")
      .setContentText("SCP está grabando video. Toca para abrir la app.")
      .setSmallIcon(android.R.drawable.presence_video_online)
      .setOngoing(true)
      .setContentIntent(pi)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }

  private fun iniciarCamara() {
    val future = ProcessCameraProvider.getInstance(this)
    future.addListener({
      try {
        val provider = future.get()
        val recorder = Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.HD)).build()
        val vc = VideoCapture.withOutput(recorder)
        videoCapture = vc
        provider.unbindAll()
        provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, vc)
        startSegment()
      } catch (e: Exception) {
        fail(e.message ?: "Fallo al iniciar la cámara")
      }
    }, ContextCompat.getMainExecutor(this))
  }

  private fun startSegment() {
    val vc = videoCapture ?: return
    val dir = File(getExternalFilesDir(null), "bodycam/pending").apply { mkdirs() }
    val file = File(dir, "bc_${System.currentTimeMillis()}.mp4")
    // Rota el archivo al llegar a ~45 MB (queda bajo el límite de 50 MB de Storage).
    val out = FileOutputOptions.Builder(file).setFileSizeLimit(SEGMENT_BYTES).build()
    var pending = vc.output.prepareRecording(this, out)
    if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO)
      == android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
      pending = pending.withAudioEnabled()
    }
    recording = pending.start(ContextCompat.getMainExecutor(this)) { event ->
      when (event) {
        is VideoRecordEvent.Start -> { isRecording = true }
        is VideoRecordEvent.Finalize -> {
          val durMs = event.recordingStats.recordedDurationNanos / 1_000_000
          // Llegar al límite de tamaño NO es un error: el archivo es válido.
          val ok = event.error == VideoRecordEvent.Finalize.ERROR_NONE ||
                   event.error == VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED
          if (ok) onSegment?.invoke("file://${file.absolutePath}", durMs)
          if (userStopping) { isRecording = false; stopSelf() }
          else { startSegment() }   // continúa con el siguiente segmento
        }
        else -> {}
      }
    }
    // Rota a los 3 minutos (detiene → Finalize → arranca el siguiente).
    rotateHandler.postDelayed(rotateRunnable, SEGMENT_MS)
  }

  private fun fail(msg: String) {
    isRecording = false
    onError?.invoke(msg)
    stopSelf()
  }

  override fun onDestroy() {
    rotateHandler.removeCallbacks(rotateRunnable)
    try { recording?.stop() } catch (_: Exception) {}
    recording = null
    isRecording = false
    super.onDestroy()
  }
}
