import fs from "fs/promises";
import YAML from "js-yaml";
import path from "path";

let loaded = false;
export let refreshProfiles = [];
export let api = {};
export let users = {};
export let encryptionKey = "";
export let google = {};

export async function loadConfig() {
  const newConfig = await loadConfigFile();
  if (!newConfig && !loaded) {
    console.error("Unable to proceed without configuration, exiting");
    process.exit(1);
  }
  if (!newConfig) {
    console.warn("Unable to load new configuration, using old one");
  } else {
    if (JSON.stringify(refreshProfiles) !== JSON.stringify(newConfig.refresh)) {
      console.info("Refresh profiles changed in configuration");
      refreshProfiles = newConfig.refresh;
    }
    if (JSON.stringify(api) !== JSON.stringify(newConfig.api)) {
      console.info("API configuration changed in configuration");
      api = newConfig.api;
    }
    if (
      JSON.stringify(encryptionKey) !== JSON.stringify(newConfig.encryption_key)
    ) {
      console.info("Secret encryption key changed in configuration");
      encryptionKey = newConfig.encryption_key;
    }
    if (JSON.stringify(google) !== JSON.stringify(newConfig.google)) {
      console.info("Google configuration changed in configuration");
      google = newConfig.google;
    }
  }

  const files = await fs.readdir("users");
  const configFiles = files.filter(
    (file) => file.startsWith("config-") && file.endsWith(".json")
  );
  const newUsers = {};
  for (const file of configFiles) {
    const user = file.substring(7, file.length - 5);
    const userConfig = await loadUserFile(user);
    if (userConfig) {
      newUsers[user] = userConfig;
      if (!users[user]) {
        console.info("New user config loaded for", user);
      }
      if (JSON.stringify(users[user]) !== JSON.stringify(userConfig)) {
        console.info("User config changed for", user);
      }
    }
  }
  users = newUsers;
  if (!loaded) {
    console.info("Loaded configuration");
    loaded = true;
  }
}

async function loadConfigFile() {
  try {
    const rawData = await fs.readFile("config.yaml", "utf8");
    const data = YAML.load(rawData);
    if (data.version !== "1.2") {
      console.error("Unsupported config version", data.version, "expected 1.2");
      return null;
    }
    return data;
  } catch (e) {
    console.error("Error reading config file:", e);
    return null;
  }
}

export async function loadUserFile(user) {
  try {
    const rawData = await fs.readFile(
      path.join("users", "config-" + user + ".json"),
      "utf8"
    );
    const data = JSON.parse(rawData);
    if (data.version !== "1.0") {
      console.error(
        "Unsupported user config version",
        data.version,
        "for",
        user,
        "expected 1.0"
      );
      return null;
    }
    data.refreshProfile = await getRefreshProfile(data);
    data.lastRefresh = new Date(data.lastRefresh || 0);
    return data;
  } catch (e) {
    console.error("Error reading user config file:", e);
    return null;
  }
}

export async function saveUserFile(user, data) {
  try {
    const dataCopy = { ...data };
    delete dataCopy.refreshProfile;
    delete dataCopy.refreshProfiles;
    const rawData = JSON.stringify(dataCopy, null, 4);
    await fs.writeFile(
      path.join("users", "config-" + user + ".json"),
      rawData,
      "utf8"
    );
    console.info("User config saved for", user);
  } catch (e) {
    console.error("Error writing user config file:", e);
  }
}

export async function getRefreshProfile(user) {
  let defaultProfile = {
    name: "default",
    weekday: [],
    weekend: [],
  };

  for (const refreshProfile of refreshProfiles) {
    if (refreshProfile.name == user.refresh) {
      return refreshProfile;
    }
    if (refreshProfile.name == "default") {
      defaultProfile = refreshProfile;
    }
  }

  return defaultProfile;
}
