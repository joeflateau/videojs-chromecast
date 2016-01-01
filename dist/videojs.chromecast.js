/*! videojs-chromecast - v1.1.1 - 2016-01-01
* https://github.com/kim-company/videojs-chromecast
* Copyright (c) 2016 KIM Keep In Mind GmbH, srl; Licensed MIT */

(function() {
  var extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  videojs.addLanguage("de", {
    "CASTING TO": "WIEDERGABE AUF"
  });

  videojs.addLanguage("it", {
    "CASTING TO": "PLAYBACK SU"
  });

  videojs.plugin("chromecast", function(options) {
    this.chromecastComponent = new videojs.ChromecastComponent(this, options);
    return this.ready((function(_this) {
      return function() {
        return _this.controlBar.addChild(_this.chromecastComponent);
      };
    })(this));
  });

  videojs.ChromecastComponent = (function(superClass) {
    extend(ChromecastComponent, superClass);

    ChromecastComponent.prototype.buttonText = "Chromecast";

    ChromecastComponent.prototype.inactivityTimeout = 2000;

    ChromecastComponent.prototype.apiInitialized = false;

    ChromecastComponent.prototype.apiSession = null;

    ChromecastComponent.prototype.apiMedia = null;

    ChromecastComponent.prototype.casting = false;

    ChromecastComponent.prototype.paused = true;

    ChromecastComponent.prototype.muted = false;

    ChromecastComponent.prototype.currentVolume = 1;

    ChromecastComponent.prototype.currentMediaTime = 0;

    ChromecastComponent.prototype.timer = null;

    ChromecastComponent.prototype.timerStep = 1000;

    function ChromecastComponent(options1, ready) {
      this.options = options1;
      ChromecastComponent.__super__.constructor.call(this, this.options, ready);
      if (!this.options.controls()) {
        this.disable();
      }
      this.hide();
      this.initializeWhenApiReady();
      this.on("click", this.onClick);
      this.player_.on("play", (function(_this) {
        return function() {
          return _this.onPlay();
        };
      })(this));
      this.player_.on("pause", (function(_this) {
        return function() {
          return _this.onPause();
        };
      })(this));
      this.player_.on("seeked", (function(_this) {
        return function() {
          return _this.onSeeked();
        };
      })(this));
      this.player_.ready((function(_this) {
        return function() {
          _this.castingEl = _this.createCastingOverlayEl();
          _this.castingReceiverText = _this.castingEl.getElementsByClassName("casting-receiver")[0];
          return _this.castingSubtextText = _this.castingEl.getElementsByClassName("casting-subtext")[0];
        };
      })(this));
    }

    ChromecastComponent.prototype.createCastingOverlayEl = function() {
      var element;
      element = document.createElement("div");
      element.className = "vjs-chromecast-casting-to";
      element.innerHTML = "<div class=\"casting-overlay\">\n  <div class=\"casting-information\">\n    <div class=\"casting-icon\">&#58880</div>\n    <div class=\"casting-description\">\n      <small>" + (this.localize("CASTING TO")) + "</small><br>\n      <span class=\"casting-receiver\"></span>\n      <span class=\"casting-subtext\"></span>\n    </div>\n  </div>\n</div>";
      this.player_.el_.insertBefore(element, this.player_.controlBar.el_);
      return element;
    };

    ChromecastComponent.prototype.updateCastingOverlay = function(receiver, status) {
      if (receiver) {
        this.castingReceiverText.innerHTML = receiver;
      }
      if (status) {
        return this.castingSubtextText.innerHTML = status;
      }
    };

    ChromecastComponent.prototype.initializeWhenApiReady = function() {
      var oldOnApiAvailable;
      if (chrome.cast && chrome.cast.isAvailable) {
        return this.initializeApi();
      } else {
        oldOnApiAvailable = window['__onGCastApiAvailable'];
        return window['__onGCastApiAvailable'] = (function(_this) {
          return function(loaded, error) {
            if (oldOnApiAvailable) {
              oldOnApiAvailable(loaded, error);
            }
            return _this.initializeApi();
          };
        })(this);
      }
    };

    ChromecastComponent.prototype.initializeApi = function() {
      var apiConfig, appId, sessionRequest;
      videojs.log("Cast APIs are available");
      appId = this.options.appId || chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID;
      sessionRequest = new chrome.cast.SessionRequest(appId);
      apiConfig = new chrome.cast.ApiConfig(sessionRequest, this.sessionJoinedListener, this.receiverListener.bind(this));
      return chrome.cast.initialize(apiConfig, this.onInitSuccess.bind(this), this.castError);
    };

    ChromecastComponent.prototype.sessionJoinedListener = function(session) {
      return console.log("Session joined");
    };

    ChromecastComponent.prototype.receiverListener = function(availability) {
      if (availability === "available") {
        return this.show();
      }
    };

    ChromecastComponent.prototype.onInitSuccess = function() {
      return this.apiInitialized = true;
    };

    ChromecastComponent.prototype.castError = function(castError) {
      return videojs.log("Cast Error: " + (JSON.stringify(castError)));
    };

    ChromecastComponent.prototype.doLaunch = function() {
      videojs.log("Cast video: " + (this.player_.currentSrc()));
      if (this.apiInitialized) {
        return chrome.cast.requestSession(this.onSessionSuccess.bind(this), this.castError);
      } else {
        return videojs.log("Session not initialized");
      }
    };

    ChromecastComponent.prototype.onSessionSuccess = function(session) {
      var image, key, loadRequest, mediaInfo, ref, value;
      videojs.log("Session initialized: " + session.sessionId);
      this.apiSession = session;
      this.addClass("connected");
      this.player_.addClass("vjs-chromecast-casting");
      this.updateCastingOverlay(this.apiSession.receiver.friendlyName, "Connected");
      mediaInfo = new chrome.cast.media.MediaInfo(this.player_.currentSrc(), this.player_.currentType());
      if (this.options.metadata) {
        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
        ref = this.options.metadata;
        for (key in ref) {
          value = ref[key];
          mediaInfo.metadata[key] = value;
        }
        if (this.player_.options_.poster) {
          image = new chrome.cast.Image(this.player_.options_.poster);
          mediaInfo.metadata.images = [image];
        }
      }
      loadRequest = new chrome.cast.media.LoadRequest(mediaInfo);
      loadRequest.autoplay = true;
      loadRequest.currentTime = this.player_.currentTime();
      this.apiSession.loadMedia(loadRequest, this.onMediaDiscovered.bind(this), this.castError);
      return this.apiSession.addUpdateListener(this.onSessionUpdate.bind(this));
    };

    ChromecastComponent.prototype.onMediaDiscovered = function(media) {
      this.apiMedia = media;
      this.apiMedia.addUpdateListener(this.onMediaStatusUpdate.bind(this));
      this.startProgressTimer(this.incrementMediaTime.bind(this));
      this.casting = true;
      this.updateCastingOverlay(this.apiSession.receiver.friendlyName, "Loading");
      this.inactivityTimeout = this.player_.options_.inactivityTimeout;
      this.player_.options_.inactivityTimeout = 0;
      this.player_.userActive(true);
      return this.playTechOnChromecastPlay = true;
    };

    ChromecastComponent.prototype.onSessionUpdate = function(isAlive) {
      if (!this.apiMedia) {
        return;
      }
      if (!isAlive) {
        return this.onStopAppSuccess();
      }
    };

    ChromecastComponent.prototype.onMediaStatusUpdate = function(isAlive) {
      if (!this.apiMedia) {
        return;
      }
      this.currentMediaTime = this.apiMedia.currentTime;
      switch (this.apiMedia.playerState) {
        case chrome.cast.media.PlayerState.IDLE:
          this.currentMediaTime = 0;
          this.trigger("timeupdate");
          return this.onStopAppSuccess();
        case chrome.cast.media.PlayerState.PAUSED:
          this.updateCastingOverlay(this.apiSession.receiver.friendlyName, "Paused");
          if (this.paused) {
            return;
          }
          this.player_.pause();
          return this.paused = true;
        case chrome.cast.media.PlayerState.PLAYING:
          this.updateCastingOverlay(this.apiSession.receiver.friendlyName, "Playing");
          if (this.playTechOnChromecastPlay) {
            this.player_.play();
            this.paused = false;
            this.playTechOnChromecastPlay = false;
            return;
          }
          if (!this.paused) {
            return;
          }
          this.player_.play();
          return this.paused = false;
      }
    };

    ChromecastComponent.prototype.startProgressTimer = function(callback) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      return this.timer = setInterval(callback.bind(this), this.timerStep);
    };

    ChromecastComponent.prototype.play = function() {
      if (!this.apiMedia) {
        return;
      }
      if (this.paused) {
        this.apiMedia.play(null, this.mediaCommandSuccessCallback.bind(this, "Playing: " + this.apiMedia.sessionId), this.onError);
        return this.paused = false;
      }
    };

    ChromecastComponent.prototype.pause = function() {
      if (!this.apiMedia) {
        return;
      }
      if (this.seeking) {
        return;
      }
      if (!this.paused) {
        this.apiMedia.pause(null, this.mediaCommandSuccessCallback.bind(this, "Paused: " + this.apiMedia.sessionId), this.onError);
        return this.paused = true;
      }
    };

    ChromecastComponent.prototype.seekMedia = function(position, forceResume) {
      var request;
      request = new chrome.cast.media.SeekRequest();
      request.currentTime = position;
      if (forceResume || this.player_.controlBar.progressControl.seekBar.videoWasPlaying) {
        request.resumeState = chrome.cast.media.ResumeState.PLAYBACK_START;
      }
      this.updateCastingOverlay(this.apiSession.receiver.friendlyName, "Seeking");
      return this.apiMedia.seek(request, this.onSeekSuccess.bind(this, position), this.onError);
    };

    ChromecastComponent.prototype.onSeekSuccess = function(position) {
      return this.currentMediaTime = position;
    };

    ChromecastComponent.prototype.setMediaVolume = function(level, mute) {
      var request, volume;
      if (!this.apiMedia) {
        return;
      }
      volume = new chrome.cast.Volume();
      volume.level = level;
      volume.muted = mute;
      this.currentVolume = volume.level;
      this.muted = mute;
      request = new chrome.cast.media.VolumeRequest();
      request.volume = volume;
      this.apiMedia.setVolume(request, this.mediaCommandSuccessCallback.bind(this, "Volume changed"), this.onError);
      return this.player_.trigger("volumechange");
    };

    ChromecastComponent.prototype.incrementMediaTime = function() {
      if (this.apiMedia.playerState !== chrome.cast.media.PlayerState.PLAYING) {
        return;
      }
      if (this.currentMediaTime < this.apiMedia.media.duration) {
        this.currentMediaTime += 1;
        return this.trigger("timeupdate");
      } else {
        this.currentMediaTime = 0;
        return clearInterval(this.timer);
      }
    };

    ChromecastComponent.prototype.mediaCommandSuccessCallback = function(information, event) {
      return videojs.log(information);
    };

    ChromecastComponent.prototype.onError = function() {
      return videojs.log("error");
    };

    ChromecastComponent.prototype.stopCasting = function() {
      return this.apiSession.stop(this.onStopAppSuccess.bind(this), this.onError);
    };

    ChromecastComponent.prototype.onStopAppSuccess = function() {
      clearInterval(this.timer);
      this.casting = false;
      this.player_.removeClass("vjs-chromecast-casting");
      this.removeClass("connected");
      this.player_.options_.inactivityTimeout = this.inactivityTimeout;
      this.apiMedia = null;
      return this.apiSession = null;
    };

    ChromecastComponent.prototype.buildCSSClass = function() {
      return ChromecastComponent.__super__.buildCSSClass.apply(this, arguments) + "vjs-chromecast-button";
    };

    ChromecastComponent.prototype.onPlay = function() {
      if (!this.casting) {
        return;
      }
      return this.play();
    };

    ChromecastComponent.prototype.onPause = function() {
      if (!this.casting) {
        return;
      }
      return this.pause();
    };

    ChromecastComponent.prototype.onSeeked = function(e) {
      var currentTime;
      if (!this.casting) {
        return;
      }
      currentTime = this.player_.currentTime();
      this.player_.pause();
      this.playTechOnChromecastPlay = true;
      this.seeking = true;
      return this.seekMedia(currentTime);
    };

    ChromecastComponent.prototype.onClick = function() {
      if (this.casting) {
        return this.stopCasting();
      } else {
        this.player_.pause();
        return this.doLaunch();
      }
    };

    return ChromecastComponent;

  })(videojs.getComponent("Button"));

}).call(this);
