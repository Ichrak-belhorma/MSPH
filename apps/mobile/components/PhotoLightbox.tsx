import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SPACING } from "@/lib/theme";

/** Full-screen preview for a single photo (a captured local photo, or an
 * already-uploaded one from case history) — a plain RN Modal, no
 * navigation route, so both the photo-capture screen and the case-history
 * thumbnails in Visit Detail can reuse it cheaply. */
export function PhotoLightbox({ uri, caption, onClose }: { uri: string | null; caption?: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.closeArea} onPress={onClose} />
        {uri && <Image source={{ uri }} style={styles.image} resizeMode="contain" />}
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>Fermer</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  closeArea: StyleSheet.absoluteFill,
  image: { width: "100%", height: "70%" },
  caption: { color: "#fff", marginTop: SPACING.md, paddingHorizontal: SPACING.xl, textAlign: "center" },
  closeButton: { marginTop: SPACING.xl, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 24 },
  closeButtonText: { color: "#fff", fontWeight: "700" },
});
