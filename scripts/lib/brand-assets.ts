export const BRAND_ASSET_PATHS = {
  productionMacIconPng: "assets/lygos-brand/icon-1024.png",
  productionLinuxIconPng: "assets/lygos-brand/icon-1024.png",
  productionWindowsIconIco: "assets/lygos-brand/icon-48.png",
  productionWebFaviconIco: "assets/lygos-brand/icon-48.png",
  productionWebFavicon16Png: "assets/lygos-brand/icon-16.png",
  productionWebFavicon32Png: "assets/lygos-brand/icon-32.png",
  productionWebAppleTouchIconPng: "assets/lygos-brand/icon-180.png",
  developmentWindowsIconIco: "assets/lygos-brand/icon-48.png",
  developmentWebFaviconIco: "assets/lygos-brand/icon-48.png",
  developmentWebFavicon16Png: "assets/lygos-brand/icon-16.png",
  developmentWebFavicon32Png: "assets/lygos-brand/icon-32.png",
  developmentWebAppleTouchIconPng: "assets/lygos-brand/icon-180.png",
} as const;

export interface IconOverride {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

export const DEVELOPMENT_ICON_OVERRIDES: ReadonlyArray<IconOverride> = [
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFaviconIco,
    targetRelativePath: "dist/client/favicon.ico",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    targetRelativePath: "dist/client/favicon-16x16.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    targetRelativePath: "dist/client/favicon-32x32.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
    targetRelativePath: "dist/client/apple-touch-icon.png",
  },
];

export const PUBLISH_ICON_OVERRIDES: ReadonlyArray<IconOverride> = [
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFaviconIco,
    targetRelativePath: "dist/client/favicon.ico",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    targetRelativePath: "dist/client/favicon-16x16.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    targetRelativePath: "dist/client/favicon-32x32.png",
  },
  {
    sourceRelativePath: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
    targetRelativePath: "dist/client/apple-touch-icon.png",
  },
];
