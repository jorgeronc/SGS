import { useState } from "react";
import { TouchableOpacity, Text, StyleSheet, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { T, UI } from "../theme";

// Campo de hora con selector nativo. value/onChange en formato "HH:MM".
export default function HoraInput({
  value, onChange, placeholder = "Elegir hora",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const base = (() => {
    const d = new Date();
    const m = value.match(/^(\d{1,2}):(\d{2})$/);
    if (m) { d.setHours(Number(m[1]), Number(m[2]), 0, 0); }
    return d;
  })();

  return (
    <>
      <TouchableOpacity style={styles.input} onPress={() => setShow(true)} activeOpacity={0.7}>
        <Text style={{ color: value ? T.text : T.textMute, fontSize: 15 }}>{value || placeholder}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={base}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(e, sel) => {
            setShow(false);
            if (e.type === "set" && sel) {
              onChange(`${String(sel.getHours()).padStart(2, "0")}:${String(sel.getMinutes()).padStart(2, "0")}`);
            }
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: T.border, borderRadius: UI.radiusSm,
    paddingHorizontal: 12, height: 46, justifyContent: "center", marginBottom: 8,
  },
});
