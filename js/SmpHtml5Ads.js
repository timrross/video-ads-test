/*jslint browser: true, sloppy: true */
/*global google */
var SmpHtml5Ads;

/* Wrap the definition to prevent accidental globals. */
(function () {
    var DUPLICATE_EVENT_TIMEOUT = 500;

    function version() {
        var TITLE = "Bbcdotcom-SmpHtml5Ads",
            MAJOR = "0",
            MINOR = "1",
            PATCH = "0";
        /**
         * The full version string.
         */
        return (MAJOR + "." + MINOR + "." + PATCH + "-" + TITLE);
    }

    function loadScript(src) {
        var script, node;
        /* Load the library, asynchronously. */
        script = document.createElement('script');
        script.async = true;
        script.type = 'text/javascript';
        script.src = src;
        node = document.getElementsByTagName('script')[0];
        node.parentNode.insertBefore(script, node);
    }

    function loadGoogleSdk() {
        loadScript('http://s0.2mdn.net/instream/html5/ima3_debug.js');
    }

    SmpHtml5Ads = function (utils, data) {

        if (false === (this instanceof SmpHtml5Ads)) {
            return new SmpHtml5Ads(utils, data);
        }

        // Set debugging up first
        this.debug = false;
        if (data.debug !== undefined) {
            this.debug = data.debug;
        }

        this.log('SmpHtml5Ads_constructor');

        this.pluginId = version();

        /* keep a ref to the player, might be undefined. Check later. */
        if (utils.playerInterface !== undefined) {
            this.setPlayerInterface(utils.playerInterface);
        }

        /* dom elements */
        this.playerControls = undefined;
        this.adContainer = undefined;

        /* google ad objects */
        this.adsLoader = undefined;
        this.adsManager = undefined;
        this.currentAd = undefined;
        this.currentAdDuration = undefined;

        /* our ad objects */
        if (data.playerDomId !== undefined) {
            this.playerDomId = data.playerDomId;
        }
        if (data.prerollAdTag !== undefined) {
            this.prerollAdTag = data.prerollAdTag;
        }
        if (data.bbcdotcom !== undefined) {
            this.bbcdotcom = data.bbcdotcom;
        }

        /* flags */
        this.playerInitialised = false;
        this.playerLoaded = false;
        this.playerStarted = false;

        this.adsInitialised = false;
        this.adsRequested = false;
        this.adsLoaded = false;
        this.adsStarted = false;
        this.adsPaused = false;
        this.adError = false;

        this.active = false;
        // Default to ads enabled.
        this.adsEnabled = true;
        this.adsCountdownTimer = false;
        
    };

    SmpHtml5Ads.prototype = {
        pluginInitialisation: function (utils) {
            this.log('pluginInitialisation');

            utils.loadCSS("SmpHtml5Ads.css");

            /* Make sure we have a valid playerInterface. */
            if (this.playerInterface === undefined && utils.playerInterface !== undefined) {
                this.setPlayerInterface(utils.playerInterface);
            }
            if (this.playerInterface === undefined) {
                // Exit early as we don't have a player interface to use.
                this.log('playerInterface not defined');
                return false;
            }
            
            /* Only set up ads if they are enabled. */
            if (this.adsEnabled) {
                /* Make sure the google sdk is loaded. */
                loadGoogleSdk();
                /* set up preroll specific markup */
                this.createAdContainer();
                this.addPlayerListeners();
            }
        },
        bind: function (context, fn) {
            return function () {
                fn.apply(context, arguments);
            };
        },
        setPlayerInterface: function (playerInterface) {
            this.log('setPlayerInterface');
            this.playerInterface = playerInterface;
            this.width = this.playerInterface.settings.width;
            this.height = this.playerInterface.settings.height;
            // Set ads enabled from the playlist. This lets us control whether ads get loaded in the playlist.
            this.adsEnabled = this.playerInterface.playlist.hasAds;
        },
        createAdContainer: function () {
            this.log('createAdContainer');
            this.adContainer = document.createElement('div');
            this.adContainer.id = 'adContainer';
            this.playerInterface.container.appendChild(this.adContainer);
        },
        addPlayerListeners: function () {
            this.log('addPlayerListeners');

            var plugin = this;

            /*
             * Add a listener to check when the player has loaded.
             */
            this.playerInterface.addEventListener('loadedmetadata', function () {
                plugin.log('player loadedmetadata');
                plugin.playerLoaded = true;
                if (plugin.playerStarted && plugin.adsLoaded && !plugin.adsStarted) {
                    // if ads are already loaded then start them.
                    plugin.startAds();
                } else if (!plugin.adsRequested) {
                    // if ads haven't been requested then we request them
                    plugin.loadAds();
                }
                // Otherwise the ads will start when the adManager gets loaded.
            });

            /*
             * Add a play listener to the player
             */
            this.playerInterface.addEventListener('play', function () {
                plugin.log('player play');
                plugin.playerStarted = true;
                // Make sure there isn't a problem with ads before we pause the content
                if (!plugin.adError) {
                    
                    if (!plugin.adsLoaded) {
                        // If ads aren't loaded then pause the player and wait
                        plugin.pauseContent();
                    }
    
                    if (plugin.playerLoaded && plugin.adsLoaded && !plugin.adsStarted) {
                        // If ads are ready to go then start them.
                        plugin.startAds();
                    } else if (!plugin.adsRequested) {
                        // if ads haven't been requested then we request them
                        plugin.loadAds();
                    }
                    // Otherwise the ads will start when the adManager gets loaded.
                }
            });

            this.playerInterface.addEventListener('pause', function () {
                plugin.log('player pause');
            });
            
            this.playerInterface.addEventListener('playlistLoaded', function() {
                plugin.log('player playlistLoaded');
            });
            
            this.playerInterface.addEventListener('mediaItemChanged', function () {
                plugin.log('player mediaItemChanged');
            });
        },
        loadAds: function () {
            this.log('loadAds');
            if (!this.adsInitialised) {
                this.initAds();
            }
            this.requestAds();
        },
        initAds: function () {
            this.log('initAds');
            // Initialise the google objects when the player is loaded.
            this.createAdDisplayContainer();
            this.initAdDisplayContainer();
            this.initCompanionSlots();
            this.createAdsLoader();
            this.adsInitialised = true;
        },
        createAdDisplayContainer: function () {
            this.log('createAdDisplayContainer');
            this.adDisplayContainer = new google.ima.AdDisplayContainer(this.adContainer);

        },
        initAdDisplayContainer: function () {
            this.log('initAdDisplayContainer');
            this.adDisplayContainer.initialize();
            this.log('adDisplayContainer initialise complete');
        },
        initCompanionSlots: function () {
            var companionId, slots;
            if (this.bbcdotcom !== undefined) {
                companionId = this.bbcdotcom.av.emp.adverts.getCompanionSlotId(this.playerDomId);
                slots = this.bbcdotcom.av.emp.adverts.getCompanionSlots(companionId);
                this.bbcdotcom.av.emp.adverts.defineCompanionSlots(slots);
            }
        },
        createAdsLoader: function () {
            this.log('createAdsLoader');
            this.adsLoader = new google.ima.AdsLoader(this.adDisplayContainer);
        },
        requestAds: function () {
            var adsRequest;
            this.log('requestAds');

            // Listen and respond to ads loaded and error events.
            this.adsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, this.bind(this, this.onAdsManagerLoaded), false);
            this.adsLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, this.bind(this, this.onAdError), false);

            if (this.prerollAdTag !== undefined) {
                // Request video ads.
                adsRequest = new google.ima.AdsRequest();
                
                adsRequest.adTagUrl = this.prerollAdTag;
                // Specify the linear and nonlinear slot sizes. This helps the SDK to
                // select the correct creative if multiple are returned.
                adsRequest.linearAdSlotWidth = this.width;
                adsRequest.linearAdSlotHeight = this.height;
                adsRequest.nonLinearAdSlotWidth = this.width;
                adsRequest.nonLinearAdSlotHeight = this.height;
                this.adsLoader.requestAds(adsRequest);
                this.adsRequested = true;
            } else {
                this.log('Problem requesting ads: no preroll ad tag');
            }
        },
        startAds: function () {
            this.log('startAds');
            try {
                if (!this.adsStarted && this.adsLoaded && this.adsManager !== undefined) {
                    // Remove the player controls
                    // Call play to start showing the ad. Single video and overlay ads will
                    // start at this time; the call will be ignored for ad rules.
                    // Initialize the ads manager. Ad rules playlist will start at this time.
                    this.adsManager.init(this.width, this.height, google.ima.ViewMode.NORMAL);
                    this.setDynamicStyles(this.width, this.height);
                    this.adsManager.start();
                    this.log('called startAds');
                    this.adsStarted = true;
                }
            } catch (adError) {
                // An error may be thrown if there was a problem with the VAST response.
                this.log('ERROR', adError);
                this.adError = true;
                this.resumeContent();
            }
        },
        onAdsManagerLoaded: function (adsManagerLoadedEvent) {
            this.log('onAdsManagerLoaded');
            this.adsLoaded = true;
            // Get the ads manager.
            this.adsManager = adsManagerLoadedEvent.getAdsManager(this.playerInterface);

            // Add listeners to the required events.
            this.adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, this.bind(this, this.onAdError));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, this.bind(this, this.onContentPause));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, this.bind(this, this.onContentResume));

            // Listen to any additional events, if necessary.
            this.adsManager.addEventListener(google.ima.AdEvent.Type.LOADED, this.bind(this, this.onAdLoaded));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.CLICK, this.bind(this, this.onAdClick));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.STARTED, this.bind(this, this.onAdStarted));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.SKIPPABLE_STATE_CHANGED, this.bind(this, this.onAdSkippable));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.PAUSED, this.bind(this, this.onAdPaused));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.RESUMED, this.bind(this, this.onAdResumed));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.COMPLETE, this.bind(this, this.onAdComplete));
            this.adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, this.bind(this, this.onAllAdsComplete));

            // If the player has already started start the ads.
            if (this.playerLoaded && this.playerStarted) {
                this.startAds();
            }
        },
        onContentPause: function (adEvent) {
            this.log(adEvent.type);
            this.pauseContent();
            this.hidePlayerControls();
            this.showAdControls();
            this.active = true;
        },
        onContentResume: function (adEvent) {
            this.log(adEvent.type);
            this.resumeContent();
        },
        onAdLoaded: function (adEvent) {
            this.log('onAdLoaded ' + adEvent.type);
            this.adsLoaded = true;
            this.currentAd = adEvent.getAd();
            this.currentAdDuration = this.currentAd.getDuration();
        },
        onAdClick: function (adEvent) {
            this.log(adEvent.type);
            this.log('video ad clicked');
        },
        onAdStarted: function (adEvent) {
            this.log(adEvent.type);
            this.startAdsCountdownTimer();
        },
        onAdSkippable: function (adEvent) {
            this.log(adEvent.type);
            this.showSkipButton();
        },
        onAdSkipped: function (adEvent) {
            this.log(adEvent.type);
        },
        onAdPaused: function (adEvent) {
            this.log(adEvent.type);
            this.adsPaused = true;
            this.clearAdsCountdownTimer();
        },
        onAdResumed: function (adEvent) {
            this.log(adEvent.type);
            this.adsPaused = false;
            this.startAdsCountdownTimer();
        },
        onAdComplete: function (adEvent) {
            this.log(adEvent.type);
            this.currentAd = undefined;
            this.currentAdDuration = undefined;
        },
        onAllAdsComplete: function (adEvent) {
            this.log(adEvent.type);
        },
        onAdError: function (adErrorEvent) {
            // Handle the error logging.
            this.log(adErrorEvent.getError());
            this.adError = true;
            this.resumeContent();
        },
        startAdsCountdownTimer: function () {
            var plugin = this;
            /* Check there isn't an existing timer and that adsManager exists */
            if (!this.adsCountdownTimer && this.adsManager !== undefined) {
                this.adsCountdownTimer = setInterval(function () {
                    var timeRemaining = plugin.adsManager.getRemainingTime();
                    // Update UI with timeRemaining
                }, 1000);
            }
        },
        clearAdsCountdownTimer: function () {
            if (this.adsCountdownTimer) {
                clearInterval(this.adsCountdownTimer);
                this.adsCountdownTimer = false;
            }
        },
        setDynamicStyles: function (width, height) {
            /*
             * Set the size of the ad container to match the main video.
             */
            this.adContainer.style.width = width + 'px';
            this.adContainer.style.height = height + 'px';
            
            /* Find the video elements inside the adcontainer and set the width explicitly. 
             * this is needed in iOS because google puts the video element in the main iframe 
             * rather than the ad iframe. */
            var i, elem, videoElements = this.adContainer.getElementsByTagName('video');
            for (i = 0; i < videoElements.length; i++) {
                elem = videoElements.item(i);
                elem.style.width = width + 'px';
                elem.style.height = height + 'px';
            }
        },
        hidePlayerControls: function () {
            this.log('hidePlayerControls');
            // Disable the player controls from the player.
            this.playerInterface.updateUiConfig(  { controls:{ enabled: false} } );
        },
        showPlayerControls: function () {
            this.log('showPlayerControls');
            this.playerInterface.updateUiConfig(  { controls:{ enabled: true} } );
        },
        hideAdControls: function () {
        },
        showAdControls: function () {
        },
        showSkipButton: function () {
        },
        hideSkipButton: function () {
        },
        playAd: function () {
            if (this.adsStarted && this.adsPaused) {
                this.adsPaused = false;
                this.adsManager.resume();
                this.startAdsCountdownTimer();
            }
        },
        pauseAd: function () {
            if (this.adsStarted && !this.adsPaused) {
                this.adsManager.pause();
                this.clearAdsCountdownTimer();
            }
        },
        resumeContent: function () {
            this.clearAdsCountdownTimer();
            this.hideAdControls();
            this.active = false;
            this.showPlayerControls();
            this.playContent();
        },
        playContent: function () {
            this.log('playContent');
            this.playerInterface.play();
        },
        pauseContent: function () {
            this.log('pauseContent');
            this.playerInterface.pause();
        },
        log: function (message) {
            var logWindow;
            if (this.debug) {
                if (window.console !== undefined && typeof window.console.log === 'function') {
                    window.console.log('SmpHtml5Ads : ', message);
                }
                logWindow = window.parent.document.getElementById('logWindow');
                if (logWindow) {
                    logWindow.innerHTML = logWindow.innerHTML + ' ' + message + '<br />';
                }
            }
        }
    };

    function getActionFn(func) {
        var acting = false,
            resetActing = function () {
                acting = false;
            };
        return function (event) {
            if (!acting) {
                if (event.type !== "keyup" || event.keyCode === 32 || event.keyCode === 13) {
                    func();
                    acting = true;
                    setTimeout(resetActing, DUPLICATE_EVENT_TIMEOUT);
                }
            }
        };
    }



    /**
     * Convert sections into a time display
     *
     * @private
     * @param {number} seconds Time in seconds
     * @returns {string} in format hh:mm:ss
     */
    function secondsToTime(seconds) {
        var mins, h, m, s;
        if (!seconds) {
            return "00:00";
        }
        mins = Math.floor(seconds / 60);
        h = Math.floor(mins / 60);
        m = Math.floor(mins % 60);
        s = Math.floor(seconds % 60);
        if (m < 10) {
            m = '0' + m;
        }
        if (s < 10) {
            s = '0' + s;
        }
        return (h > 0 ? [h, m, s].join(':') : [m, s].join(':'));
    }

    function className(el, add, remove) {
        if (!el) {
            return;
        }
        var cn = el.className;
        if (cn === "") {
            el.className = add;
            return;
        }
        cn = cn.replace(new RegExp("\\b" + remove + "\\b", "g"), "").replace(new RegExp("\\b" + add + "\\b", "g"), "") + " " + add;
        el.className = cn.trim();
    }

}());

/**
 * This function creates a new instance of the plugin by requiring the module defined above.
 */
var runPlugin = function (utils, data) {
    console.log('runPlugin');
    return new SmpHtml5Ads(utils, data);
};