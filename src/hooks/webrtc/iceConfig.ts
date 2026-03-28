interface IceServerEntry {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const buildIceServers = (): IceServerEntry[] => {
  const servers: IceServerEntry[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  const customUrl = import.meta.env.VITE_TURN_URL;
  const customUser = import.meta.env.VITE_TURN_USERNAME;
  const customCred = import.meta.env.VITE_TURN_CREDENTIAL;

  if (customUrl && customUser && customCred) {
    servers.push({ urls: customUrl, username: customUser, credential: customCred });
  }

  const meteredUser = "e8dd65a92f3aad1a0cca8cb6";
  const meteredCred = "gEn0smmGOSaoRH0B";

  servers.push(
    { urls: "turn:a.relay.metered.ca:80", username: meteredUser, credential: meteredCred },
    { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: meteredUser, credential: meteredCred },
    { urls: "turn:a.relay.metered.ca:443", username: meteredUser, credential: meteredCred },
    { urls: "turns:a.relay.metered.ca:443?transport=tcp", username: meteredUser, credential: meteredCred },
  );

  return servers;
};

export const ICE_CONFIG: RTCConfiguration = {
  iceServers: buildIceServers(),
  iceTransportPolicy: "all",
  iceCandidatePoolSize: 2,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

export const ICE_RESTART_COOLDOWN_MS = 10_000;
export const DISCONNECT_GRACE_MS = 5_000;
export const MAX_ICE_RESTARTS = 3;
