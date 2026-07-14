/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

interface AudioInput {
    context: AudioContext;
    mute: boolean;
    setPTTActive(active: boolean): void;
    setSpeaking(active: boolean): void;
}

interface MixedInput {
    input: AudioInput;
    sourceStream: MediaStream;
    source: MediaStreamAudioSourceNode;
    microphoneGain: GainNode;
    destination: MediaStreamAudioDestinationNode;
}

interface SoundboardSound {
    soundId: string;
    volume?: number;
}

interface PlaybackSource {
    input: AudioInput;
    source: AudioBufferSourceNode;
    gain: GainNode;
}

interface Playback {
    controller: AbortController;
    sources: PlaybackSource[];
}

const logger = new Logger("SoundboardPermissionsBypass");
const mixedInputs = new Map<MediaStream, MixedInput>();
const playbacks = new Set<Playback>();

function stopPlayback(active: Playback): void {
    if (!playbacks.delete(active)) return;

    active.controller.abort();
    for (const { input, source, gain } of active.sources) {
        source.onended = null;
        try {
            source.stop();
        } catch (error) {
            logger.debug("Soundboard playback was already stopped", error);
        }
        source.disconnect();
        gain.disconnect();
        const isStillPlaying = [...playbacks].some(playback => playback.sources.some(source => source.input === input));
        if (input.mute) input.setSpeaking(isStillPlaying);
        else input.setPTTActive(isStillPlaying);

        for (const mixed of mixedInputs.values()) {
            if (mixed.input !== input) continue;
            mixed.microphoneGain.gain.value = input.mute ? 0 : 1;
            for (const track of mixed.destination.stream.getAudioTracks()) track.enabled = !input.mute || isStillPlaying;
        }
    }
}

export default definePlugin({
    name: "SoundboardPermissionsBypass",
    description: "Routes Discord soundboard sounds through your microphone, bypassing normal soundboard permissions.",
    authors: [{ name: "yash", id: 889150838658977874n }],
    tags: ["Fun", "Voice"],

    patches: [
        {
            find: 'type:"GUILD_SOUNDBOARD_SOUND_CREATE"',
            replacement: {
                match: /(?<=type:"(?:SOUNDBOARD_SOUNDS_RECEIVED|GUILD_SOUNDBOARD_SOUND_CREATE|GUILD_SOUNDBOARD_SOUND_UPDATE|GUILD_SOUNDBOARD_SOUNDS_UPDATE)".{0,200}?available:)\i\.available/g,
                replace: "!0",
            },
        },
        {
            find: /getFlattenedGuildIds\(\).{0,100}USE_EXTERNAL_SOUNDS.{0,100}canUseSoundboardEverywhere/,
            replacement: {
                match: /\i\.\i\.can\(\i\.\i\.USE_EXTERNAL_SOUNDS,\i\)/,
                replace: "!0",
            },
        },
        {
            find: "CALLABLE.has(e.type))return!0;let",
            replacement: {
                match: /(?<=return \i\.isGuildVoiceOrThread\(\))&&\i&&(\i)/,
                replace: "&&$1",
            },
        },
        {
            find: ".SEND_SOUNDBOARD_SOUND(",
            group: true,
            replacement: [
                {
                    match: /function \i\((\i),(\i),\i,\i\)\{(?=\(0,\i\.\i\)\(\2,\1,\i\.\i\.SOUNDBOARD\))/,
                    replace: "$&return $self.playSound($1);",
                },
                {
                    match: /\(\i\.Ay\.canUseSoundboardEverywhere\(\i\)\|\|\i\.guildId===\i\?\.guild_id\|\|"0"===\i\.guildId\)/,
                    replace: "!0",
                },
                {
                    match: /\i\.A\.can\(\i\.xBc\.USE_EXTERNAL_SOUNDS,\i\)/,
                    replace: "!0",
                },
            ],
        },
        {
            find: "soundboard_floating_upsell",
            group: true,
            replacement: [
                {
                    match: /j=\(0,\i\.TW\)\(\i,\i\.PremiumTypes\.TIER_2\)/,
                    replace: "j=!0",
                },
                {
                    match: /a=\i\.Ay\.isPremium\(\i,\i\.PremiumTypes\.TIER_2\)/,
                    replace: "a=!0",
                },
            ],
        },
        {
            find: "AudioInput: No MediaStream",
            group: true,
            replacement: [
                {
                    match: /(?<=}else this\.stream=\i;)return this\.updateMode\(\)/,
                    replace: "this.stream=$self.mixInput(this,this.stream);return this.updateMode()",
                },
                {
                    match: /release\((\i)\)\{\1\.getTracks\(\)/,
                    replace: "release($1){$self.releaseInput($1);$1.getTracks()",
                },
                {
                    match: /(?<=\.enabled=)!this\._mute/,
                    replace: "$self.shouldEnableInput(this)",
                },
                {
                    match: /set mute\((\i)\)\{this\._mute=\1,this\.updateAudioTracks\(\),this\.setSpeaking\(!1\)/,
                    replace: "set mute($1){this._mute=$1,this.updateAudioTracks(),this.setSpeaking($self.isInputPlaying(this))",
                },
            ],
        },
    ],

    mixInput(input: AudioInput, stream: MediaStream): MediaStream {
        const source = input.context.createMediaStreamSource(stream);
        const microphoneGain = input.context.createGain();
        const destination = input.context.createMediaStreamDestination();
        source.connect(microphoneGain).connect(destination);

        const mixedStream = destination.stream;
        mixedInputs.set(mixedStream, { input, sourceStream: stream, source, microphoneGain, destination });
        return mixedStream;
    },

    releaseInput(stream: MediaStream): void {
        const mixed = mixedInputs.get(stream);
        if (mixed == null) return;

        mixedInputs.delete(stream);
        mixed.source.disconnect();
        mixed.microphoneGain.disconnect();
        for (const track of mixed.sourceStream.getTracks()) track.stop();
    },

    shouldEnableInput(input: AudioInput): boolean {
        for (const mixed of mixedInputs.values()) {
            if (mixed.input === input) mixed.microphoneGain.gain.value = input.mute ? 0 : 1;
        }
        return !input.mute || this.isInputPlaying(input);
    },

    isInputPlaying(input: AudioInput): boolean {
        for (const playback of playbacks) {
            if (playback.sources.some(source => source.input === input)) return true;
        }
        return false;
    },

    async playSound(sound: SoundboardSound): Promise<void> {
        const inputs = [...mixedInputs.values()];
        if (inputs.length === 0) {
            showToast("Join a voice channel before playing a sound.", Toasts.Type.FAILURE);
            return;
        }

        const controller = new AbortController();
        const active: Playback = { controller, sources: [] };
        playbacks.add(active);

        try {
            const [{ input: firstInput }] = inputs;
            const { context } = firstInput;
            await context.resume();

            const response = await fetch(
                `https://${window.GLOBAL_ENV.CDN_HOST}/soundboard-sounds/${encodeURIComponent(sound.soundId)}`,
                { signal: controller.signal },
            );
            if (!response.ok) throw new Error(`Soundboard request failed with status ${response.status}.`);

            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            if (!playbacks.has(active)) return;

            const volume = Math.max(0, Math.min(1, sound.volume ?? 1));
            for (const [index, { input, microphoneGain, destination }] of inputs.entries()) {
                const source = input.context.createBufferSource();
                const gain = input.context.createGain();
                source.buffer = buffer;
                gain.gain.value = volume;
                source.connect(gain).connect(destination);
                if (index === 0) gain.connect(input.context.destination);
                source.onended = () => {
                    stopPlayback(active);
                };
                active.sources.push({ input, source, gain });
                microphoneGain.gain.value = input.mute ? 0 : 1;
                for (const track of destination.stream.getAudioTracks()) track.enabled = true;
                if (input.mute) input.setSpeaking(true);
                else input.setPTTActive(true);
                source.start();
            }
        } catch (error) {
            const { aborted } = controller.signal;
            stopPlayback(active);
            if (!aborted) {
                logger.error("Failed to play soundboard sound through the microphone", error);
                showToast("Couldn't play this sound through your microphone.", Toasts.Type.FAILURE);
            }
        }
    },

    stop() {
        for (const playback of playbacks) stopPlayback(playback);
        for (const [stream] of mixedInputs) {
            this.releaseInput(stream);
            for (const track of stream.getTracks()) track.stop();
        }
    },
});
