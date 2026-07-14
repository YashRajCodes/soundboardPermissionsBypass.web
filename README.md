# Discord Soundboard Permissions Bypass Plugin

**SoundboardPermissionsBypass** is a Discord soundboard plugin for Vencord and Equicord that routes soundboard sounds through your microphone. It lets other people in a voice channel hear Discord soundboard audio as microphone input, even when normal soundboard permissions are unavailable.

The plugin supports Discord Web and web-based Discord clients, including Vesktop and Equibop. It does not support the official Discord Desktop app because that client uses a different voice engine.

## Usage

1. Enable the plugin.
2. Join a voice channel.
3. Play a soundboard sound.

The sound is routed through the active microphone input, so other people in the voice channel hear it as microphone audio.

## Installation

### Vencord

Follow the official Vencord installation guide first:

<https://docs.vencord.dev/installing/>

For a source build, clone Vencord and install its dependencies as described in the Vencord documentation.

Using a custom userplugin requires a Vencord source checkout. Create the userplugin directory if it does not already exist:

```sh
mkdir -p src/userplugins
```

```sh
cp /path/to/soundboardPermissionsBypass.web/index.ts src/userplugins/soundboardPermissionsBypass.web.ts
```

Build Vencord from its repository root:

```sh
pnpm build
```

Install or launch the resulting build using the normal Vencord workflow. Enable **SoundboardPermissionsBypass** in Discord's Vencord plugin settings.

### Equicord

Follow Equicord's source-build guide:

<https://docs.equicord.org/building-from-source/>

From the root of an Equicord checkout, create a directory for the userplugin:

```sh
mkdir -p src/userplugins/soundboardPermissionsBypass.web
```

Copy the plugin into that directory as `index.ts`:

```sh
cp /path/to/soundboardPermissionsBypass.web/index.ts src/userplugins/soundboardPermissionsBypass.web/index.ts
```

Build Equicord using the commands from its source-build guide. Then enable **SoundboardPermissionsBypass** in the plugin settings.
