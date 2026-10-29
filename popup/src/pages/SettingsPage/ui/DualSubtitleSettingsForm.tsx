import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { DUAL_SETTINGS_KEY, DualSubtitleSettings, normalizeDualSettings } from "@extension/common/types/dualSubtitles.ts";
import { getFromStorage, setToStorage } from "@/shared/lib/helpers/storage.ts";
import { useNotifications } from "@/shared/lib/notifications/notifications.ts";

export const DualSubtitleSettingsForm: FC = () => {
  const { t } = useTranslation("settings");
  const notifications = useNotifications();
  const [settings, setSettings] = useState<DualSubtitleSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getFromStorage<Partial<DualSubtitleSettings>>(DUAL_SETTINGS_KEY, "sync")
      .then((value) => { if (alive) setSettings(normalizeDualSettings(value)); })
      .catch((error) => {
        console.error("Could not read dual subtitle settings", error);
        if (alive) setLoadFailed(true);
      });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "sync" && changes[DUAL_SETTINGS_KEY]) {
        setLoadFailed(false);
        setSettings(normalizeDualSettings(changes[DUAL_SETTINGS_KEY].newValue as Partial<DualSubtitleSettings> | undefined));
      }
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { alive = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);

  if (loadFailed) return <Alert severity="error">{t("dual.loadFailed")}</Alert>;
  if (!settings) return null;
  const persist = async (next: DualSubtitleSettings) => {
    try {
      await setToStorage(DUAL_SETTINGS_KEY, next, "sync");
    } catch (error) {
      console.error("Could not save dual subtitle settings", error);
      notifications.show(t("dual.saveFailed"), { severity: "error", autoHideDuration: 5000 });
      // Restore the value that actually landed rather than showing a false success.
      getFromStorage<Partial<DualSubtitleSettings>>(DUAL_SETTINGS_KEY, "sync")
        .then((value) => setSettings(normalizeDualSettings(value))).catch(() => {});
    }
  };
  const toggle = (key: "enabled" | "showRussian" | "crossHighlight" | "matchYouTubeFontSize", value: boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    void persist(next);
  };
  const slider = (key: "fontSize" | "textOpacity" | "backgroundOpacity" | "verticalGap", min: number, max: number, step: number, unit: string) => (
    <Box>
      <Typography variant="body2" id={`dual-${key}-label`}>
        {t(key === "verticalGap" && settings.position === "top" ? "dual.topOffset" : `dual.${key}`)}: {settings[key]}{unit}
      </Typography>
      <Slider
        aria-labelledby={`dual-${key}-label`}
        min={min} max={max} step={step} value={settings[key]}
        onChange={(_, value) => setSettings({ ...settings, [key]: value as number })}
        onChangeCommitted={(_, value) => void persist({ ...settings, [key]: value as number })}
      />
    </Box>
  );

  return (
    <Box>
      <Divider sx={{ mb: 1 }}/>
      <FormControlLabel control={<Switch checked={settings.enabled} onChange={(_, value) => toggle("enabled", value)}/>} label={t("dual.enabled")}/>
      <FormHelperText>{t("dual.helper")}</FormHelperText>
      <Collapse in={settings.enabled} unmountOnExit>
        <FormControlLabel control={<Switch checked={settings.showRussian} onChange={(_, value) => toggle("showRussian", value)}/>} label={t("dual.showRussian")}/>
        <FormControlLabel control={<Switch checked={settings.crossHighlight} onChange={(_, value) => toggle("crossHighlight", value)}/>} label={t("dual.crossHighlight")}/>
        <FormControl fullWidth size="small" sx={{ my: 1 }}>
          <InputLabel id="dual-position-label">{t("dual.position")}</InputLabel>
          <Select
            labelId="dual-position-label"
            label={t("dual.position")}
            value={settings.position}
            onChange={(event) => {
              const position = event.target.value === "top" ? "top" : "above";
              const next = { ...settings, position } as DualSubtitleSettings;
              setSettings(next);
              void persist(next);
            }}
          >
            <MenuItem value="above">{t("dual.positionAbove")}</MenuItem>
            <MenuItem value="top">{t("dual.positionTop")}</MenuItem>
          </Select>
        </FormControl>
        <FormControlLabel
          control={<Switch checked={settings.matchYouTubeFontSize} onChange={(_, value) => toggle("matchYouTubeFontSize", value)}/>}
          label={t("dual.matchYouTubeFontSize")}
        />
        <Collapse in={!settings.matchYouTubeFontSize} unmountOnExit>
          {slider("fontSize", 12, 48, 1, "px")}
        </Collapse>
        {slider("textOpacity", 25, 100, 5, "%")}
        {slider("backgroundOpacity", 0, 100, 5, "%")}
        {slider("verticalGap", 0, 80, 2, "px")}
      </Collapse>
      <Divider sx={{ mt: 1 }}/>
    </Box>
  );
};
