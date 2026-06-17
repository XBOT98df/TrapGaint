package com.mojang.authlib.yggdrasil;

import com.google.common.cache.CacheBuilder;
import com.google.common.cache.CacheLoader;
import com.google.common.cache.LoadingCache;
import com.google.common.collect.Iterables;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.mojang.authlib.GameProfile;
import com.mojang.authlib.HttpAuthenticationService;
import com.mojang.authlib.exceptions.AuthenticationException;
import com.mojang.authlib.exceptions.AuthenticationUnavailableException;
import com.mojang.authlib.minecraft.HttpMinecraftSessionService;
import com.mojang.authlib.minecraft.InsecureTextureException;
import com.mojang.authlib.minecraft.MinecraftProfileTexture;
import com.mojang.authlib.properties.Property;
import com.mojang.authlib.yggdrasil.request.JoinMinecraftServerRequest;
import com.mojang.authlib.yggdrasil.response.HasJoinedMinecraftServerResponse;
import com.mojang.authlib.yggdrasil.response.MinecraftProfilePropertiesResponse;
import com.mojang.authlib.yggdrasil.response.MinecraftTexturesPayload;
import com.mojang.authlib.yggdrasil.response.Response;
import com.mojang.util.UUIDTypeAdapter;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

// Classpath override for legacy authlib 1.x.
// Minecraft 1.8-1.12 hardcodes the session profile endpoint and ignores
// minecraft.api.session.host, so we mirror the original implementation and
// only make fillGameProfile honor that system property.
public class YggdrasilMinecraftSessionService extends HttpMinecraftSessionService {
    private static final String[] WHITELISTED_DOMAINS = new String[] { ".minecraft.net", ".mojang.com" };
    private static final Logger LOGGER = LogManager.getLogger();
    private static final String DEFAULT_SESSION_HOST = "https://sessionserver.mojang.com";
    private static final URL JOIN_URL = HttpAuthenticationService.constantURL(
        DEFAULT_SESSION_HOST + "/session/minecraft/join"
    );
    private static final URL CHECK_URL = HttpAuthenticationService.constantURL(
        DEFAULT_SESSION_HOST + "/session/minecraft/hasJoined"
    );

    private final PublicKey publicKey;
    private final Gson gson;
    private final LoadingCache<GameProfile, GameProfile> insecureProfiles;

    protected YggdrasilMinecraftSessionService(final YggdrasilAuthenticationService authenticationService) {
        super(authenticationService);
        this.gson = new GsonBuilder()
            .registerTypeAdapter(UUID.class, new UUIDTypeAdapter())
            .create();
        this.insecureProfiles = CacheBuilder.newBuilder()
            .expireAfterWrite(6L, TimeUnit.HOURS)
            .build(new CacheLoader<GameProfile, GameProfile>() {
                @Override
                public GameProfile load(GameProfile key) {
                    return fillGameProfile(key, false);
                }
            });

        try {
            byte[] publicKeyBytes = readFully(
                YggdrasilAuthenticationService.class.getResourceAsStream("/yggdrasil_session_pubkey.der")
            );
            X509EncodedKeySpec spec = new X509EncodedKeySpec(publicKeyBytes);
            KeyFactory factory = KeyFactory.getInstance("RSA");
            this.publicKey = factory.generatePublic(spec);
        } catch (Exception ignored) {
            throw new Error("Missing/invalid yggdrasil public key!");
        }
    }

    @Override
    public void joinServer(GameProfile profile, String authenticationToken, String serverId)
        throws AuthenticationException {
        JoinMinecraftServerRequest request = new JoinMinecraftServerRequest();
        request.accessToken = authenticationToken;
        request.selectedProfile = profile.getId();
        request.serverId = serverId;
        getAuthenticationService().makeRequest(JOIN_URL, request, Response.class);
    }

    @Override
    public GameProfile hasJoinedServer(GameProfile profile, String serverId)
        throws AuthenticationUnavailableException {
        Map<String, Object> arguments = new HashMap<String, Object>();
        arguments.put("username", profile.getName());
        arguments.put("serverId", serverId);

        URL url = HttpAuthenticationService.concatenateURL(
            CHECK_URL,
            HttpAuthenticationService.buildQuery(arguments)
        );

        try {
            HasJoinedMinecraftServerResponse response = getAuthenticationService().makeRequest(
                url,
                null,
                HasJoinedMinecraftServerResponse.class
            );
            if (response != null && response.getId() != null) {
                GameProfile result = new GameProfile(response.getId(), profile.getName());
                if (response.getProperties() != null) {
                    result.getProperties().putAll(response.getProperties());
                }
                return result;
            }
            return null;
        } catch (AuthenticationUnavailableException e) {
            throw e;
        } catch (AuthenticationException ignored) {
            return null;
        }
    }

    @Override
    public Map<MinecraftProfileTexture.Type, MinecraftProfileTexture> getTextures(
        GameProfile profile,
        boolean requireSecure
    ) {
        Property textureProperty = Iterables.getFirst(profile.getProperties().get("textures"), null);
        if (textureProperty == null) {
            return new HashMap<MinecraftProfileTexture.Type, MinecraftProfileTexture>();
        }

        // Legacy authlib verifies against Mojang's hardcoded key only. When we route
        // profile requests to the local launcher bridge for offline skins, signatures
        // are local and should be accepted here.
        if (requireSecure && !isLocalBridgeSessionHost()) {
            if (!textureProperty.hasSignature()) {
                LOGGER.error("Signature is missing from textures payload");
                throw new InsecureTextureException("Signature is missing from textures payload");
            }
            if (!textureProperty.isSignatureValid(this.publicKey)) {
                LOGGER.error("Textures payload has been tampered with (signature invalid)");
                throw new InsecureTextureException("Textures payload has been tampered with (signature invalid)");
            }
        }

        final MinecraftTexturesPayload result;
        try {
            String json = new String(
                Base64.getDecoder().decode(textureProperty.getValue()),
                StandardCharsets.UTF_8
            );
            result = this.gson.fromJson(json, MinecraftTexturesPayload.class);
        } catch (JsonParseException e) {
            LOGGER.error("Could not decode textures payload", e);
            return new HashMap<MinecraftProfileTexture.Type, MinecraftProfileTexture>();
        } catch (IllegalArgumentException e) {
            LOGGER.error("Could not decode textures payload", e);
            return new HashMap<MinecraftProfileTexture.Type, MinecraftProfileTexture>();
        }

        if (result == null || result.getTextures() == null) {
            return new HashMap<MinecraftProfileTexture.Type, MinecraftProfileTexture>();
        }

        for (Map.Entry<MinecraftProfileTexture.Type, MinecraftProfileTexture> entry : result.getTextures().entrySet()) {
            MinecraftProfileTexture texture = entry.getValue();
            if (texture == null || !isWhitelistedDomain(texture.getUrl())) {
                LOGGER.error("Textures payload has been tampered with (non-whitelisted domain)");
                return new HashMap<MinecraftProfileTexture.Type, MinecraftProfileTexture>();
            }
        }

        return result.getTextures();
    }

    @Override
    public GameProfile fillProfileProperties(GameProfile profile, boolean requireSecure) {
        if (profile.getId() == null) {
            return profile;
        }
        if (!requireSecure) {
            return this.insecureProfiles.getUnchecked(profile);
        }
        return fillGameProfile(profile, true);
    }

    protected GameProfile fillGameProfile(GameProfile profile, boolean requireSecure) {
        try {
            URL url = HttpAuthenticationService.constantURL(
                getSessionHost() + "/session/minecraft/profile/" + UUIDTypeAdapter.fromUUID(profile.getId())
            );
            url = HttpAuthenticationService.concatenateURL(
                url,
                "unsigned=" + (!requireSecure)
            );

            MinecraftProfilePropertiesResponse response = getAuthenticationService().makeRequest(
                url,
                null,
                MinecraftProfilePropertiesResponse.class
            );
            if (response == null) {
                LOGGER.debug("Couldn't fetch profile properties for " + profile + " as the profile does not exist");
                return profile;
            }

            GameProfile result = new GameProfile(response.getId(), response.getName());
            result.getProperties().putAll(response.getProperties());
            profile.getProperties().putAll(response.getProperties());
            LOGGER.debug("Successfully fetched profile properties for " + profile);
            return result;
        } catch (AuthenticationException e) {
            LOGGER.warn("Couldn't look up profile properties for " + profile, e);
            return profile;
        }
    }

    @Override
    public YggdrasilAuthenticationService getAuthenticationService() {
        return (YggdrasilAuthenticationService) super.getAuthenticationService();
    }

    private static String getSessionHost() {
        String override = System.getProperty("minecraft.api.session.host");
        if (override == null) {
            return DEFAULT_SESSION_HOST;
        }

        override = override.trim();
        if (override.isEmpty()) {
            return DEFAULT_SESSION_HOST;
        }

        while (override.endsWith("/")) {
            override = override.substring(0, override.length() - 1);
        }
        return override;
    }

    private static boolean isLocalBridgeSessionHost() {
        String sessionHost = getSessionHost();
        String lower = sessionHost.toLowerCase(Locale.ROOT);
        if (lower.startsWith("http://localhost") || lower.startsWith("https://localhost")) {
            return true;
        }
        if (lower.startsWith("http://127.0.0.1") || lower.startsWith("https://127.0.0.1")) {
            return true;
        }
        if (lower.startsWith("http://[::1]") || lower.startsWith("https://[::1]")) {
            return true;
        }

        try {
            URI uri = new URI(sessionHost);
            String host = uri.getHost();
            if (host == null) {
                return false;
            }
            host = host.toLowerCase(Locale.ROOT);
            return host.equals("localhost") || host.equals("127.0.0.1") || host.equals("::1");
        } catch (URISyntaxException ignored) {
            return false;
        }
    }

    private static boolean isWhitelistedDomain(String url) {
        final URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Invalid URL '" + url + "'");
        }

        String host = uri.getHost();
        if (host == null) {
            return false;
        }
        host = host.toLowerCase(Locale.ROOT);

        for (String domain : WHITELISTED_DOMAINS) {
            if (host.endsWith(domain)) {
                return true;
            }
        }
        return false;
    }

    private static byte[] readFully(InputStream inputStream) throws IOException {
        if (inputStream == null) {
            throw new IOException("Missing resource stream");
        }

        try {
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
            return outputStream.toByteArray();
        } finally {
            inputStream.close();
        }
    }
}
