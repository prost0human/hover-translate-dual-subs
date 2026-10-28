import FileDownloadIcon from "@mui/icons-material/FileDownload";
import IconButton from "@mui/material/IconButton";
import { Fragment, useState, MouseEvent, ChangeEvent, FC } from "react";
import MenuItem from "@mui/material/MenuItem";
import Menu from "@mui/material/Menu";
import { useTranslation } from "react-i18next";
import { downloadFile } from "@/shared/lib/helpers/downloadFiles.ts";
import { getAnkiCSVToExport, getCSVToExport, getJSONToExport } from "../lib/helpers/getFormattedData.ts";
import { generateShortHash } from "@/shared/lib/helpers/generateShortHash.ts";
import { useNotifications } from "@/shared/lib/notifications/notifications.ts";
import { sendMessage } from "@/shared/lib/helpers/sendMessage.ts";
import { parseDictionaryBackup } from "../lib/helpers/importDictionary.ts";

export const ExportData: FC = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const { t } = useTranslation("dictionary");

  const notifications = useNotifications();

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };
  
  const getFileName = async (data: string) => {
    try {
      const hash = await generateShortHash(data);
      return `hover-translate-dictionary-${hash}`;
    } catch (error) {
      const errorMessage = "Failed to generate file name";
      notifications.show(errorMessage, { severity: "error", autoHideDuration: 5000 });
      console.error(errorMessage, error);
      return `hover-translate-dictionary-${Date.now()}`;
    }
  };

  const exportJSON = async () => {
    try {
      const jsonString = await getJSONToExport();
      const fileName = await getFileName(jsonString);

      await downloadFile(jsonString, fileName, "json");
      handleClose();
    } catch (error) {
      const errorMessage = "Failed to export JSON data";
      notifications.show(errorMessage, { severity: "error", autoHideDuration: 5000 });
      console.error(errorMessage, error);
    }
  };

  const exportCSV = async () => {
    try {
      const csvString = await getCSVToExport();
      const fileName = await getFileName(csvString);

      await downloadFile(csvString, fileName, "csv");
      handleClose();
    } catch (error) {
      const errorMessage = "Failed to export CSV data";
      notifications.show(errorMessage, { severity: "error", autoHideDuration: 5000 });
      console.error(errorMessage, error);
    }
  };

  const exportAnki = async () => {
    try {
      const data = await getAnkiCSVToExport();
      const fileName = await getFileName(data);
      await downloadFile(data, `${fileName}-anki`, "csv");
      handleClose();
    } catch (error) {
      notifications.show(t("actions.exportAnki.failed"), { severity: "error", autoHideDuration: 5000 });
      console.error("Failed to export Anki CSV", error);
    }
  };

  const importJSON = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("The file is larger than 5 MB");
      const entries = parseDictionaryBackup(await file.text());
      const result = await sendMessage<{ imported: number; skipped: number }>({ action: "importDictionaryEntries", value: entries });
      notifications.show(t("actions.importJSON.success", result), { severity: "success", autoHideDuration: 5000 });
      handleClose();
    } catch (error) {
      notifications.show(t("actions.importJSON.failed"), { severity: "error", autoHideDuration: 5000 });
      console.error("Failed to import dictionary", error);
    }
  };

  return (
    <Fragment>
      <IconButton onClick={handleClick} title={t("actions.export.tooltip")}>
        <FileDownloadIcon />
      </IconButton>
      <Menu
        id="export-data-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
      >
        <MenuItem component="label" title={t("actions.importJSON.tooltip")}>
          {t("actions.importJSON.text")}
          <input type="file" accept="application/json,.json" hidden onChange={importJSON}/>
        </MenuItem>
        <MenuItem
          onClick={exportJSON}
          title={t("actions.exportJSON.tooltip")}
        >
          {t("actions.exportJSON.text")}
        </MenuItem>
        <MenuItem onClick={exportAnki} title={t("actions.exportAnki.tooltip")}>
          {t("actions.exportAnki.text")}
        </MenuItem>
        <MenuItem
          onClick={exportCSV}
          title={t("actions.exportCSV.tooltip")}
        >
          {t("actions.exportCSV.text")}
        </MenuItem>
      </Menu>
    </Fragment>
  );
};