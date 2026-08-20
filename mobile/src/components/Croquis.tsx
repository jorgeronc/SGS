import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { T, UI } from "../theme";

// Lienzo del croquis sobre un <canvas> dentro de un WebView. Usa Pointer Events
// para que cada trazo vaya de que se apoya la pluma/dedo hasta que se levanta o
// sale del lienzo (se corrige el defecto de "pluma pegada"). Incluye deshacer,
// borrador, paleta de colores y modo pantalla completa.
const COLORES: { k: string; hex: string }[] = [
  { k: "Negro", hex: "#000000" },
  { k: "Azul Rey", hex: "#1a3fd6" },
  { k: "Rojo", hex: "#e53935" },
  { k: "Amarillo", hex: "#fdd835" },
  { k: "Naranja", hex: "#fb8c00" },
  { k: "Verde", hex: "#2e7d32" },
  { k: "Gris Claro", hex: "#b0bec5" },
];

const HTML = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;height:100%;background:#fff;overflow:hidden;}
  #c{display:block;width:100%;height:100%;background:#fff;touch-action:none;}
</style></head><body>
<canvas id="c"></canvas>
<script>
  var canvas=document.getElementById('c'), ctx=canvas.getContext('2d');
  var drawing=false,lastX=0,lastY=0,dirty=false,color='#000000',eraser=false,undo=[];
  function setup(keep){
    var prev=keep?canvas.toDataURL():null;
    canvas.width=canvas.clientWidth;canvas.height=canvas.clientHeight;
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(prev){var im=new Image();im.onload=function(){ctx.drawImage(im,0,0,canvas.width,canvas.height);};im.src=prev;}
  }
  function stroke(){ctx.strokeStyle=eraser?'#ffffff':color;ctx.lineWidth=eraser?24:3;}
  function pos(e){var r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function pushUndo(){try{undo.push(ctx.getImageData(0,0,canvas.width,canvas.height));if(undo.length>25)undo.shift();}catch(_){}}
  function start(e){e.preventDefault();pushUndo();drawing=true;stroke();var p=pos(e);lastX=p.x;lastY=p.y;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+0.1,p.y+0.1);ctx.stroke();dirty=true;}
  function move(e){if(!drawing)return;e.preventDefault();var p=pos(e);ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(p.x,p.y);ctx.stroke();lastX=p.x;lastY=p.y;dirty=true;}
  function end(){if(!drawing)return;drawing=false;auto();}
  function auto(){try{window.ReactNativeWebView.postMessage(JSON.stringify({tipo:'croquis',data:canvas.toDataURL('image/png'),dirty:dirty}));}catch(_){}}
  canvas.addEventListener('pointerdown',start,{passive:false});
  canvas.addEventListener('pointermove',move,{passive:false});
  canvas.addEventListener('pointerup',end);
  canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('pointerleave',end);
  canvas.addEventListener('pointerout',end);
  window.__cmd=function(c){
    var i=c.indexOf(':'),op=i<0?c:c.substring(0,i),v=i<0?'':c.substring(i+1);
    if(op==='clear'){setup(false);undo=[];dirty=false;auto();}
    else if(op==='undo'){if(undo.length){ctx.putImageData(undo.pop(),0,0);dirty=(undo.length>0);auto();}}
    else if(op==='color'){color=v;eraser=false;}
    else if(op==='eraser'){eraser=(v==='1');}
    else if(op==='resize'){setup(true);}
    else if(op==='load'){setup(false);if(v){var im=new Image();im.onload=function(){ctx.drawImage(im,0,0,canvas.width,canvas.height);};im.src=v;dirty=true;}}
    else if(op==='export'){auto();}
  };
  window.onload=function(){setup(false);};
  true;
</script></body></html>`;

function Toolbar({ color, eraser, onColor, onEraser, onUndo, onClear, onFull, full }: {
  color: string; eraser: boolean;
  onColor: (hex: string) => void; onEraser: () => void; onUndo: () => void; onClear: () => void; onFull: () => void; full: boolean;
}) {
  return (
    <>
      <View style={styles.paleta}>
        {COLORES.map((c) => (
          <TouchableOpacity
            key={c.k}
            style={[styles.swatch, { backgroundColor: c.hex }, !eraser && color === c.hex && styles.swatchOn]}
            onPress={() => onColor(c.hex)}
          />
        ))}
        <TouchableOpacity style={[styles.tool, eraser && styles.toolOn]} onPress={onEraser}>
          <Ionicons name="brush" size={16} color={eraser ? T.white : T.text} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={onUndo}><Ionicons name="arrow-undo" size={16} color={T.text} /><Text style={styles.btnTxt}>Deshacer</Text></TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={onClear}><Ionicons name="trash" size={16} color={T.text} /><Text style={styles.btnTxt}>Limpiar</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnPrim]} onPress={onFull}>
          <Ionicons name={full ? "contract" : "expand"} size={16} color={T.white} /><Text style={[styles.btnTxt, { color: T.white }]}>{full ? "Cerrar" : "Pantalla completa"}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function Croquis({ onCambio }: { onCambio: (base64: string) => void }) {
  const inlineRef = useRef<WebView>(null);
  const fsRef = useRef<WebView>(null);
  const [tiene, setTiene] = useState(false);
  const [color, setColor] = useState("#000000");
  const [eraser, setEraser] = useState(false);
  const [full, setFull] = useState(false);
  const imgRef = useRef<string>("");

  const activeRef = () => (full ? fsRef : inlineRef);
  const cmd = (op: string) => activeRef().current?.injectJavaScript(`window.__cmd('${op}');true;`);

  function onMessage(e: any) {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.tipo === "croquis") {
        imgRef.current = m.data;
        setTiene(!!m.dirty);
        onCambio(m.dirty ? m.data : "");
      }
    } catch { /* ignore */ }
  }

  function elegirColor(hex: string) { setColor(hex); setEraser(false); cmd(`color:${hex}`); }
  function toggleEraser() { const n = !eraser; setEraser(n); cmd(`eraser:${n ? "1" : "0"}`); }
  function undo() { cmd("undo"); }
  function limpiar() { cmd("clear"); onCambio(""); setTiene(false); imgRef.current = ""; }

  function abrirFull() { setFull(true); }
  function cerrarFull() {
    // Sincroniza lo dibujado en pantalla completa hacia el lienzo normal.
    if (imgRef.current) inlineRef.current?.injectJavaScript(`window.__cmd('load:${imgRef.current}');true;`);
    setFull(false);
  }

  function cargarEn(ref: React.RefObject<WebView>) {
    if (imgRef.current) ref.current?.injectJavaScript(`window.__cmd('load:${imgRef.current}');true;`);
    // Reaplica color/borrador al (re)cargar.
    ref.current?.injectJavaScript(`window.__cmd('${eraser ? "eraser:1" : `color:${color}`}');true;`);
  }

  return (
    <View>
      <View style={styles.lienzo}>
        <WebView
          ref={inlineRef}
          originWhitelist={["*"]}
          source={{ html: HTML }}
          style={styles.web}
          scrollEnabled={false}
          onMessage={onMessage}
          onLoadEnd={() => cargarEn(inlineRef)}
        />
      </View>
      <Toolbar color={color} eraser={eraser} onColor={elegirColor} onEraser={toggleEraser} onUndo={undo} onClear={limpiar} onFull={abrirFull} full={false} />
      <Text style={styles.hint}>{tiene ? "Croquis capturado ✓" : "Dibuja; levanta la pluma para terminar un trazo e iniciar otro."}</Text>

      <Modal visible={full} animationType="slide" onRequestClose={cerrarFull}>
        <SafeAreaView style={styles.fsSafe} edges={["top", "bottom"]}>
          <View style={styles.fsLienzo}>
            <WebView
              ref={fsRef}
              originWhitelist={["*"]}
              source={{ html: HTML }}
              style={styles.web}
              scrollEnabled={false}
              onMessage={onMessage}
              onLoadEnd={() => cargarEn(fsRef)}
            />
          </View>
          <View style={styles.fsBar}>
            <Toolbar color={color} eraser={eraser} onColor={elegirColor} onEraser={toggleEraser} onUndo={undo} onClear={limpiar} onFull={cerrarFull} full={true} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  lienzo: { height: 260, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm, overflow: "hidden", backgroundColor: "#fff" },
  web: { flex: 1, backgroundColor: "#fff" },
  paleta: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "#ffffff" },
  swatchOn: { borderColor: T.text, transform: [{ scale: 1.15 }] },
  tool: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: T.accentDim, alignItems: "center", justifyContent: "center", backgroundColor: T.surface },
  toolOn: { backgroundColor: T.accent, borderColor: T.accent },
  row: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: T.accentDim, borderRadius: UI.radiusSm, paddingVertical: 10, paddingHorizontal: 12 },
  btnPrim: { backgroundColor: T.accent, borderColor: T.accent },
  btnTxt: { color: T.text, fontWeight: "700", fontSize: 13 },
  hint: { color: T.textMute, fontSize: 12, marginTop: 6 },
  fsSafe: { flex: 1, backgroundColor: T.bg },
  fsLienzo: { flex: 1, backgroundColor: "#fff", margin: 8, borderRadius: UI.radiusSm, overflow: "hidden", borderWidth: 1, borderColor: T.border },
  fsBar: { paddingHorizontal: 12, paddingBottom: 8 },
});
