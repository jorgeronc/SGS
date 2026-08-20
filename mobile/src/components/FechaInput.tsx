import { useState } from "react";
import { TouchableOpacity, Text, StyleSheet, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { T, UI } from "../theme";

// Campo de fecha con selector nativo. value/onChange en formato "AAAA-MM-DD".
export default function FechaInput({
  value, onChange, placeholder = "Seleccionar fecha", editable = true, maximumDate,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
  maximumDate?: Date;
}) {
  const [show, setShow] = useState(false);
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const base = parsed && !isNaN(parsed.getTime()) ? parsed : new Date(2000, 0, 1);

  return (
    <>
      <TouchableOpacity style={styles.input} onPress={() => editable && setShow(true)} activeOpacity={0.7}>
        <Text style={{ color: value ? T.text : T.textMute, fontSize: 15 }}>{value || placeholder}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={base}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={maximumDate ?? new Date()}
          onChange={(e, sel) => {
            setShow(false);
            if (e.type === "set" && sel) {
              const y = sel.getFullYear();
              const m = String(sel.getMonth() + 1).padStart(2, "0");
              const d = String(sel.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${d}`);
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
