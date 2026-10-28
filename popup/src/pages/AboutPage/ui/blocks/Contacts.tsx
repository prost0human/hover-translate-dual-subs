import { FC } from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import GitHubIcon from "@mui/icons-material/GitHub";
import BugReportIcon from "@mui/icons-material/BugReport";
import { useTranslation } from "react-i18next";

export const Contacts: FC = () => {
  const { t } = useTranslation("about");

  const openGithubProjectPage = () => {
    chrome.tabs.create({
      url: "https://github.com/prost0human/hover-translate-dual-subs",
    });
  };

  const openGithubIssuesPage = () => {
    chrome.tabs.create({
      url: "https://github.com/prost0human/hover-translate-dual-subs/issues",
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom textTransform="uppercase" fontWeight="bold">
        {t("blocks.contacts.title")}
      </Typography>
      <List>
        <ListItemButton onClick={openGithubProjectPage}>
          <ListItemIcon>
            <GitHubIcon />
          </ListItemIcon>
          <ListItemText primary={t("blocks.contacts.github")} />
        </ListItemButton>

        <ListItemButton component="a" href="https://github.com/kozii-d/hover-translate" target="_blank" rel="noopener noreferrer">
          <ListItemIcon><GitHubIcon /></ListItemIcon>
          <ListItemText primary={t("blocks.contacts.upstream")} />
        </ListItemButton>

        <ListItemButton onClick={openGithubIssuesPage}>
          <ListItemIcon>
            <BugReportIcon />
          </ListItemIcon>
          <ListItemText primary={t("blocks.contacts.reportIssues")} />
        </ListItemButton>
      </List>
    </Box>
  );
};