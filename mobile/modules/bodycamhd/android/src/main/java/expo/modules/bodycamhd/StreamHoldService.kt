package expo.modules.bodycamhd

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

// Foreground service MÍNIMO de tipo cámara+micrófono. NO abre la cámara (no usa
// CameraX): solo mantiene un servicio en primer plano con ese tipo declarado,
// que es lo que Android 14+ exige para que la app (react-native-webrtc) pueda
// seguir usando la cámara con la pantalla bloqueada durante una transmisión en
// vivo. Se arranca al iniciar la alerta y se detiene al terminarla.
class StreamHoldService : Service() {
  companion object {
    const val CHANNEL_ID = "tx_hold"
    const val NOTIF_ID = 7413
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Transmisión en vivo", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pi = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE)
    val notif = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("🔴 Transmisión en vivo")
      .setContentText("Enviando video a central. Toca para abrir la app.")
      .setSmallIcon(android.R.drawable.presence_video_online)
      .setOngoing(true)
      .setContentIntent(pi)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIF_ID, notif,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      )
    } else {
      startForeground(NOTIF_ID, notif)
    }
    return START_NOT_STICKY
  }
}
