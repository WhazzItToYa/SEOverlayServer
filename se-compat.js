const URL_PARAMS = new URLSearchParams(window.location.search);
const SB_HOST = URL_PARAMS.get('sbHost') || "127.0.0.1";
const SB_PORT = URL_PARAMS.get('sbPort') || 8080;

const sbotClient = new StreamerbotClient({
    host: SB_HOST,
    port: SB_PORT,
    onConnect: sbotConnected,
    onDisconnect: sbotDisconnected,
    onError: sbotError
});

function sbotDisconnected() {
    console.log("Disconnected from Streamer.bot");
}
function sbotError() {
    console.log("Error with Streamer.bot");
}

function bindEvent(element, eventName, eventHandler) {
    if (element.addEventListener) {
        element.addEventListener(eventName, eventHandler, false);
    } else if (element.attachEvent) {
        element.attachEvent('on' + eventName, eventHandler);
    }
}

bindEvent(window, 'message', function (event) {
    const data = event.data;
    if (data.listener && SE_API.responses[data.listener]) {
        if (data.error) {
            SE_API.responses[data.listener].reject(data.error);
        } else {
            SE_API.responses[data.listener].resolve(data.result);
        }
        return;
    }
    
    if (data.listener && data.listener.indexOf('resp_') === 0) {
        return;
    }
    
    const session = data.session;
    delete data.session;
    
    const e = new CustomEvent('onEventReceived', {
        detail: data
    });
    window.dispatchEvent(e);
    
    if (session) {
        const sessionEvent = new CustomEvent('onSessionUpdate', {
            detail: {
                session: session
            }
        });
        window.dispatchEvent(sessionEvent)
    }
});

//////////////////////////////////////////////////////////////////////
//
// StreamElements event emulation
//

function dispatchSEEvent(listener, data) {
    const e = new CustomEvent('onEventReceived', {
        detail: {
            listener: listener,
            event: data
        }
    });
    console.log("Dispatching SE event", e);
    window.dispatchEvent(e);
}

// Chat message
sbotClient.on("Twitch.ChatMessage", ({data}) => {

    console.log("Processing twitch message: ", data);
    dispatchSEEvent("message",
                    {service: "twitch",
                     data: {
                         "time": Date.now(), // 1552400352142,
                         "tags": {
                             /* These seem to be raw tags from the IRC message, which streamer.bot doesn't provide
                                "badges": "broadcaster/1",
                                "color": "#641FEF",
                                "display-name": "SenderName",
                                "emotes": "25:5-9",
                                "flags": "",
                                "id": "885d1f33-8387-4206-a668-e9b1409a998b",
                                "mod": "0",
                                "room-id": "85827806",
                                "subscriber": "0",
                                "tmi-sent-ts": "1552400351927",
                                "turbo": "0",
                                "user-id": "85827806",
                                "user-type": ""
                             */
                         },
                         "nick": data.user.login, // "sendername",
                         "userId": data.user.id, // "123123",
                         "displayName": data.user.name, // "SenderName",
                         "displayColor": data.user.color, // "#641FEF",
                         "badges": data.user.badges.map(convertBadge),
                         "channel": _WIDGET_DATA.channel.username, // "channelname",
                         "text": data.text, // "Test Kappa test",
                         "isAction": data.meta.isMe, // false, ( /me )
                         "emotes": data.emotes.map(convertEmote),
                         "msgId": data.messageId // "885d1f33-8387-4206-a668-e9b1409a99Xb"
                     }}
                   );
});
// message deleted
sbotClient.on("Twitch.ChatMessageDeleted", ({data: {messageId}}) => {
    dispatchSEEvent("delete-message", {msgId: messageId});
});
// Mulitple messages deleted because of ban/timeout
sbotClient.on("Twitch.UserBanned", ({data: {targetUser: {id}}}) => {
    dispatchSEEvent("delete-messages", {userId: id});
});
sbotClient.on("Twitch.UserTimedOut", ({data: {targetUser: {id}}}) =>  {
    dispatchSEEvent("delete-messages", {userId: id});
});

// button click (what would the sbot equivalent of that be?)

async function sbotConnected() {
    console.log("Connected to Streamer.bot");

    // Emulate the WidgetLoad event, which provides a bunch of information about the widget and the
    // channel

    // Get broadcaster info
    const broadcaster = await sbotClient.getBroadcaster();

    let avatar = "https://static-cdn.jtvnw.net/user-default-pictures-uv/215b7342-def9-11e9-9a66-784f43822e80-profile_image-150x150.png";
    const avatarResp = await fetch(`https://decapi.me/twitch/avatar/${broadcaster.platforms.twitch.broadcastUserName}`);
    if (avatarResp.ok) {
        avatar = await avatarResp.text();
    }
    
    _WIDGET_DATA.channel = {
        username: broadcaster.platforms.twitch.broadcastUserName,
        providerId: broadcaster.platforms.twitch.broadcastUserId,
        avatar: avatar
    };

    const e = new CustomEvent('onWidgetLoad', {
        detail: _WIDGET_DATA
    });

    console.log("dispatching onWidgetLoad", _WIDGET_DATA);
    window.dispatchEvent(e);
}



const SE_API = {
    responses: {},

    // PORTED
    getOverlayStatus: async () => {
        return   {"isEditorMode":false, "muted":false};
    },

    counters: {
        get: async key => {
            return JSON.parse(await sbotClient.getGlobal(key, true));
        }
    },
    store: {
        get: async key => {
            return JSON.parse(await sbotClient.getGlobal(key, true));
        },
        set: (key, value) => {
            // setGlobal isn't a real thing
            return sbotClient.setGlobal(JSON.stringify(key), value, true);
            // TODO: Emit a kvstore:update event
        }
    },
    // NOT PORTED
    
    sendMessage: (message, data = {}) => {
        return new Promise((resolve, reject) => {
            const response = 'resp_' + Math.random().toString(16).substr(2);
            data.response = response;
            data.request = message;
            SE_API.responses[response] = { resolve, reject };
            parent.postMessage(data, '*');
        });
    },
    resumeQueue: () => {
        return SE_API.sendMessage('resume_queue');
    },
    sanitize: (message) => {
        return SE_API.sendMessage('sanitize', { message });
    },
    cheerFilter: (message) => {
        return SE_API.sendMessage('cheer_filter', { message });
    },
    setField: (key, value, reload) => {
        return SE_API.sendMessage('set_field', { key, value, reload });
    },
    events: {
        emit: (event, data = {}) => {
            return SE_API.sendMessage('overlay_emit', { event, data });
        },
        broadcast: (event, data = {}) => {
            return SE_API.sendMessage('overlay_broadcast', { event, data });
        }
    }
};

function convertBadge(sbBadge) {
    return  {
        version: `${sbBadge.version}`, // "1",
        type: sbBadge.name, // "broadcaster",
        url: sbBadge.imageUrl, // "https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3",
        description: sbBadge.name // There's an .info, but it is always blank.
    };
}

function convertEmote(sbEmote) {
    return {
        "type": sbEmote.type, // "twitch",
        "name": sbEmote.name, // "Kappa",
        "id": `${sbEmote.type}:${sbEmote.name}`, // "25",
        "gif": false,
        "urls": {
            "1": sbEmote.imageUrl, // "https://static-cdn.jtvnw.net/emoticons/v1/25/1.0",
            "2": sbEmote.imageUrl, // "https://static-cdn.jtvnw.net/emoticons/v1/25/2.0",
            "4": sbEmote.imageUrl // "https://static-cdn.jtvnw.net/emoticons/v1/25/4.0"
        },
        "start": sbEmote.startIndex,
        "end": sbEmote.endIndex
    };
}
