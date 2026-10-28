import { FC } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

export const Description: FC = () => {
  const { t } = useTranslation("about");

  return (
    <Box>
      <Typography variant="h5" gutterBottom fontWeight="bold">
        {t("blocks.description.forkTitle")}
      </Typography>
      <Typography variant="subtitle1" component="p" color={"text.secondary"}>
        {t("blocks.description.subtitle")}
      </Typography>
      <Typography variant="subtitle1" component="p" color={"text.secondary"}>
        {t("blocks.description.forkNotice")}
      </Typography>
    </Box>
  );
};