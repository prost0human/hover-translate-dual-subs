import { Translation } from "../model/types/schema.ts";
import { FC, useState } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import { useTranslation } from "react-i18next";
import { dictionaryLinks } from "../lib/helpers/dictionaryLinks.ts";

interface TranslationRecordProps {
  translation: Translation;
  onRemove: (id: string) => void;
  onEdit: (id: string, changes: Partial<Translation>) => Promise<boolean>;
  isLast: boolean;
}

/** Only browser links; records are plain text, never injected as HTML. */
export const TranslationRecord: FC<TranslationRecordProps> = ({ translation, onRemove, onEdit, isLast }) => {
  const { t } = useTranslation("dictionary");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(translation);
  const [saving, setSaving] = useState(false);
  const links = dictionaryLinks(translation.originalText);
  const videoUrl = (() => {
    try {
      const url = new URL(translation.videoUrl ?? "");
      return url.protocol === "https:" && /(^|\.)youtube\.com$/i.test(url.hostname) ? url.toString() : undefined;
    } catch { return undefined; }
  })();

  const save = async () => {
    if (!draft.originalText.trim() || !draft.translatedText.trim()) return;
    setSaving(true);
    try {
      if (await onEdit(translation.id, {
        originalText: draft.originalText.trim(), translatedText: draft.translatedText.trim(),
        exampleOriginal: draft.exampleOriginal ?? "", exampleTranslation: draft.exampleTranslation ?? "", note: draft.note ?? "",
      })) setEditing(false);
    } finally { setSaving(false); }
  };
  const field = (key: "originalText" | "translatedText" | "exampleOriginal" | "exampleTranslation" | "note", multiline = false) => (
    <TextField
      fullWidth margin="dense" label={t(`fields.${key}`)} value={draft[key] ?? ""} multiline={multiline}
      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
    />
  );

  return (
    <Box sx={{ padding: "8px 0", borderBottom: isLast ? 0 : 1, borderColor: "divider" }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body1" sx={{ flex: 1, overflowWrap: "anywhere" }} title={translation.sourceLanguageCode} dir="auto">{translation.originalText}</Typography>
        <Typography variant="body1" sx={{ flex: 1, overflowWrap: "anywhere" }} title={translation.targetLanguageCode} dir="auto">{translation.translatedText}</Typography>
        <IconButton onClick={(event) => setAnchor(event.currentTarget)} title={t("actions.openDictionary.tooltip")}><OpenInNewIcon/></IconButton>
        <IconButton onClick={() => { setDraft(translation); setEditing(true); }} title={t("actions.editTranslation.tooltip")}><EditIcon/></IconButton>
        <IconButton onClick={() => onRemove(translation.id)} title={t("actions.deleteTranslation.tooltip")}><DeleteIcon/></IconButton>
      </Stack>
      {translation.exampleOriginal && <Typography variant="body2" dir="auto" sx={{ overflowWrap: "anywhere" }}>{translation.exampleOriginal}</Typography>}
      {translation.exampleTranslation && <Typography variant="body2" color="text.secondary" dir="auto" sx={{ overflowWrap: "anywhere" }}>{translation.exampleTranslation}</Typography>}
      {translation.note && <Typography variant="body2" dir="auto" sx={{ overflowWrap: "anywhere" }}>{translation.note}</Typography>}
      {videoUrl && <Link href={videoUrl} target="_blank" rel="noopener noreferrer" variant="body2">{translation.videoTitle || t("fields.videoSource")}</Link>}
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {links.map(({ name, url }) => <MenuItem key={name} component="a" href={url} target="_blank" rel="noopener noreferrer" onClick={() => setAnchor(null)}>{name}</MenuItem>)}
      </Menu>
      <Dialog open={editing} onClose={() => setEditing(false)} fullWidth>
        <DialogTitle>{t("edit.title")}</DialogTitle>
        <DialogContent>{field("originalText")}{field("translatedText")}{field("exampleOriginal", true)}{field("exampleTranslation", true)}{field("note", true)}</DialogContent>
        <DialogActions><Button onClick={() => setEditing(false)}>{t("edit.cancel")}</Button><Button disabled={saving || !draft.originalText.trim() || !draft.translatedText.trim()} onClick={() => void save()}>{t("edit.save")}</Button></DialogActions>
      </Dialog>
    </Box>
  );
};
