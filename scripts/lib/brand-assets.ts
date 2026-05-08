export const BRAND_ASSET_PATHS = {
  productionMacIconPng: "assets/lygos-brand/icon-1024.png",
  productionLinuxIconPng: "assets/lygos-brand/icon-1024.png",
  productionWindowsIconIco: "assets/lygos-brand/icon-48.png",
  productionWebFaviconIco: "assets/lygos-brand/icon-48.png",
  productionWebFavicon16Png: "assets/lygos-brand/icon-16.png",
  productionWebFavicon32Png: "assets/lygos-brand/icon-32.png",
  productionWebAppleTouchIconPng: "assets/lygos-brand/icon-180.png",

  nightlyMacIconPng: "assets/lygos-brand/icon-1024.png",
  nightlyLinuxIconPng: "assets/lygos-brand/icon-1024.png",
  nightlyWindowsIconIco: "assets/lygos-brand/icon-48.png",

  developmentDesktopIconPng: "assets/lygos-brand/icon-1024.png",
  developmentWindowsIconIco: "assets/lygos-brand/icon-48.png",
  developmentWebFaviconIco: "assets/lygos-brand/icon-48.png",
  developmentWebFavicon16Png: "assets/lygos-brand/icon-16.png",
  developmentWebFavicon32Png: "assets/lygos-brand/icon-32.png",
  developmentWebAppleTouchIconPng: "assets/lygos-brand/icon-180.png",
} as const;

export type WebAssetBrand = "development" | "production";

export interface IconOverride {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

const WEB_ICON_TARGET_FILENAMES = {
  faviconIco: "favicon.ico",
  favicon16Png: "favicon-16x16.png",
  favicon32Png: "favicon-32x32.png",
  appleTouchIconPng: "apple-touch-icon.png",
} as const;

const WEB_ICON_SOURCE_PATHS_BY_BRAND = {
  development: {
    faviconIco: BRAND_ASSET_PATHS.developmentWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
  },
  production: {
    faviconIco: BRAND_ASSET_PATHS.productionWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
  },
} as const satisfies Record<WebAssetBrand, Record<keyof typeof WEB_ICON_TARGET_FILENAMES, string>>;

export function resolveWebIconOverrides(
  brand: WebAssetBrand,
  targetDirectory: string,
): ReadonlyArray<IconOverride> {
  const sourcePaths = WEB_ICON_SOURCE_PATHS_BY_BRAND[brand];
  return [
    {
      sourceRelativePath: sourcePaths.faviconIco,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.faviconIco}`,
    },
    {
      sourceRelativePath: sourcePaths.favicon16Png,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.favicon16Png}`,
    },
    {
      sourceRelativePath: sourcePaths.favicon32Png,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.favicon32Png}`,
    },
    {
      sourceRelativePath: sourcePaths.appleTouchIconPng,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.appleTouchIconPng}`,
    },
  ];
}

export const DEVELOPMENT_ICON_OVERRIDES = resolveWebIconOverrides("development", "dist/client");

export const PUBLISH_ICON_OVERRIDES = resolveWebIconOverrides("production", "dist/client");
