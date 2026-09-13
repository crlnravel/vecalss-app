const BANNER_LEGACY_CONFIG_KEY = "student.banner-maker.v1" as const;

const BANNER_DESTINATIONS = [
  {
    configKey: "student.banner-maker.v2.beranda",
    key: "beranda",
    route: "/dashboard",
  },
  {
    configKey: "student.banner-maker.v2.materi",
    key: "materi",
    route: "/courses",
  },
  {
    configKey: "student.banner-maker.v2.kuis",
    key: "kuis",
    route: "/quiz",
  },
  {
    configKey: "student.banner-maker.v2.tryout",
    key: "tryout",
    route: "/tryout",
  },
] as const;

type BannerDestination = (typeof BANNER_DESTINATIONS)[number]["key"];
type BannerDestinationDefinition = (typeof BANNER_DESTINATIONS)[number];

const BANNER_V2_CONFIG_KEYS = BANNER_DESTINATIONS.map(({ configKey }) => configKey);

class BannerDestinationError extends Error {
  constructor(message = "Tujuan banner tidak dikenali.") {
    super(message);
    this.name = "BannerDestinationError";
  }
}

function isBannerDestination(value: unknown): value is BannerDestination {
  return BANNER_DESTINATIONS.some((destination) => destination.key === value);
}

function parseBannerDestination(value: unknown): BannerDestination {
  if (!isBannerDestination(value)) {
    throw new BannerDestinationError();
  }

  return value;
}

function parseBannerDestinationQuery(value: string | string[] | undefined): BannerDestination {
  return value === undefined ? "beranda" : parseBannerDestination(value);
}

function buildBannerMakerDestinationRoute(destination: BannerDestination = "beranda") {
  return `/admin/student-banners?destination=${encodeURIComponent(parseBannerDestination(destination))}`;
}

function getBannerDestination(value: unknown): BannerDestinationDefinition | null {
  return BANNER_DESTINATIONS.find((destination) => destination.key === value) ?? null;
}

function getBannerDestinationByConfigKey(configKey: string): BannerDestinationDefinition | null {
  return BANNER_DESTINATIONS.find((destination) => destination.configKey === configKey) ?? null;
}

export {
  BANNER_DESTINATIONS,
  BANNER_LEGACY_CONFIG_KEY,
  BANNER_V2_CONFIG_KEYS,
  BannerDestinationError,
  buildBannerMakerDestinationRoute,
  getBannerDestination,
  getBannerDestinationByConfigKey,
  isBannerDestination,
  parseBannerDestination,
  parseBannerDestinationQuery,
};
export type { BannerDestination, BannerDestinationDefinition };
