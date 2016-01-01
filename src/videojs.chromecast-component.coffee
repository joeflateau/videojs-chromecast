class videojs.ChromecastComponent extends videojs.getComponent("Button")
  buttonText: "Chromecast"
  inactivityTimeout: 2000

  apiInitialized: false
  apiSession: null
  apiMedia: null

  casting: false
  paused: true
  muted: false
  currentVolume: 1
  currentMediaTime: 0

  timer: null
  timerStep: 1000

  constructor: (@options, ready) ->
    super @options, ready

    @disable() unless @options.controls()
    @hide()
    @initializeWhenApiReady()
    @on "click", @onClick
    @player_.on "play", () => @onPlay()
    @player_.on "pause", () => @onPause()
    @player_.on "seeked", () => @onSeeked()

    @player_.ready () =>
      @castingEl = @createCastingOverlayEl()
      @castingReceiverText = @castingEl.getElementsByClassName("casting-receiver")[0]
      @castingSubtextText = @castingEl.getElementsByClassName("casting-subtext")[0]

  createCastingOverlayEl: ->
    element = document.createElement "div"
    element.className = "vjs-chromecast-casting-to"
    element.innerHTML = """
      <div class="casting-overlay">
        <div class="casting-information">
          <div class="casting-icon">&#58880</div>
          <div class="casting-description">
            <small>#{@localize "CASTING TO"}</small><br>
            <span class="casting-receiver"></span>
            <span class="casting-subtext"></span>
          </div>
        </div>
      </div>
    """
    @player_.el_.insertBefore(element, @player_.controlBar.el_)
    element

  updateCastingOverlay: (receiver, status) ->
    @castingReceiverText.innerHTML = receiver if receiver
    @castingSubtextText.innerHTML = status if status

  initializeWhenApiReady: ->
    if chrome.cast and chrome.cast.isAvailable
      @initializeApi()
    else
      oldOnApiAvailable = window['__onGCastApiAvailable']
      window['__onGCastApiAvailable'] = (loaded, error) =>
        if oldOnApiAvailable
          oldOnApiAvailable(loaded, error)
        @initializeApi()

  initializeApi: ->
    videojs.log "Cast APIs are available"

    appId = @options.appId or chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID
    sessionRequest = new chrome.cast.SessionRequest(appId)

    apiConfig = new chrome.cast.ApiConfig(sessionRequest, @sessionJoinedListener, @receiverListener.bind(this))

    chrome.cast.initialize apiConfig, @onInitSuccess.bind(this), @castError

  sessionJoinedListener: (session) ->
    console.log "Session joined"

  receiverListener: (availability) ->
    @show() if availability is "available"

  onInitSuccess: ->
    @apiInitialized = true

  castError: (castError) ->
    videojs.log "Cast Error: #{JSON.stringify(castError)}"

  doLaunch: ->
    videojs.log "Cast video: #{@player_.currentSrc()}"
    if @apiInitialized
      chrome.cast.requestSession @onSessionSuccess.bind(this), @castError
    else
      videojs.log "Session not initialized"

  onSessionSuccess: (session) ->
    videojs.log "Session initialized: #{session.sessionId}"

    @apiSession = session
    @addClass "connected"
    @player_.addClass "vjs-chromecast-casting"
    @updateCastingOverlay(@apiSession.receiver.friendlyName, "Connected")

    mediaInfo = new chrome.cast.media.MediaInfo @player_.currentSrc(), @player_.currentType()

    if @options.metadata
      mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata()

      for key, value of @options.metadata
        mediaInfo.metadata[key] = value

      if @player_.options_.poster
        image = new chrome.cast.Image(@player_.options_.poster)
        mediaInfo.metadata.images = [image]

    loadRequest = new chrome.cast.media.LoadRequest(mediaInfo)
    loadRequest.autoplay = true
    loadRequest.currentTime = @player_.currentTime()

    @apiSession.loadMedia loadRequest, @onMediaDiscovered.bind(this), @castError
    @apiSession.addUpdateListener @onSessionUpdate.bind(this)

  onMediaDiscovered: (media) ->
    @apiMedia = media
    @apiMedia.addUpdateListener @onMediaStatusUpdate.bind(this)

    @startProgressTimer @incrementMediaTime.bind(this)

    @casting = true
    @updateCastingOverlay(@apiSession.receiver.friendlyName, "Loading")

    # Always show the controlbar
    @inactivityTimeout = @player_.options_.inactivityTimeout
    @player_.options_.inactivityTimeout = 0
    @player_.userActive true

    @playTechOnChromecastPlay = true

  onSessionUpdate: (isAlive) ->
    return unless @apiMedia

    @onStopAppSuccess() if not isAlive

  onMediaStatusUpdate: (isAlive) ->
    return unless @apiMedia

    @currentMediaTime = @apiMedia.currentTime

    switch @apiMedia.playerState
      when chrome.cast.media.PlayerState.IDLE
        @currentMediaTime = 0
        @trigger "timeupdate"
        @onStopAppSuccess()
      when chrome.cast.media.PlayerState.PAUSED
        @updateCastingOverlay(@apiSession.receiver.friendlyName, "Paused")
        return if @paused
        @player_.pause()
        @paused = true
      when chrome.cast.media.PlayerState.PLAYING
        @updateCastingOverlay(@apiSession.receiver.friendlyName, "Playing")
        if @playTechOnChromecastPlay
          @player_.play()
          @paused = false
          @playTechOnChromecastPlay = false
          return
        return unless @paused
        @player_.play()
        @paused = false

  startProgressTimer: (callback) ->
    if @timer
      clearInterval @timer
      @timer = null

    @timer = setInterval(callback.bind(this), @timerStep)

  play: ->
    return unless @apiMedia

    if @paused
      @apiMedia.play null, @mediaCommandSuccessCallback.bind(this, "Playing: " + @apiMedia.sessionId), @onError
      @paused = false

  pause: ->
    return unless @apiMedia
    return if @seeking

    unless @paused
      @apiMedia.pause null, @mediaCommandSuccessCallback.bind(this, "Paused: " + @apiMedia.sessionId), @onError
      @paused = true

  seekMedia: (position, forceResume) ->
    request = new chrome.cast.media.SeekRequest()
    request.currentTime = position
    # Make sure playback resumes. videoWasPlaying does not survive minification.
    request.resumeState = chrome.cast.media.ResumeState.PLAYBACK_START if forceResume or @player_.controlBar.progressControl.seekBar.videoWasPlaying

    @updateCastingOverlay(@apiSession.receiver.friendlyName, "Seeking")
    @apiMedia.seek request, @onSeekSuccess.bind(this, position), @onError

  onSeekSuccess: (position) ->
    @currentMediaTime = position

  setMediaVolume: (level, mute) ->
    return unless @apiMedia

    volume = new chrome.cast.Volume()
    volume.level = level
    volume.muted = mute

    @currentVolume = volume.level
    @muted = mute

    request = new chrome.cast.media.VolumeRequest()
    request.volume = volume

    @apiMedia.setVolume request, @mediaCommandSuccessCallback.bind(this, "Volume changed"), @onError
    @player_.trigger "volumechange"

  incrementMediaTime: ->
    return unless @apiMedia.playerState is chrome.cast.media.PlayerState.PLAYING

    if @currentMediaTime < @apiMedia.media.duration
      @currentMediaTime += 1
      @trigger "timeupdate"
    else
      @currentMediaTime = 0
      clearInterval @timer

  mediaCommandSuccessCallback: (information, event) ->
    videojs.log information

  onError: ->
    videojs.log "error"

  # Stops the casting on the Chromecast
  stopCasting: ->
    @apiSession.stop @onStopAppSuccess.bind(this), @onError

  # Callback when the app has been successfully stopped
  onStopAppSuccess: ->
    clearInterval @timer
    @casting = false
    @player_.removeClass "vjs-chromecast-casting"
    @removeClass "connected"

    # Enable user activity timeout
    @player_.options_.inactivityTimeout = @inactivityTimeout

    @apiMedia = null
    @apiSession = null

  buildCSSClass: ->
    super + "vjs-chromecast-button"

  onPlay: () ->
    return unless @casting
    @play()

  onPause: () ->
    return unless @casting
    @pause()

  onSeeked: (e) ->
    return unless @casting
    currentTime = @player_.currentTime()
    @player_.pause()
    @playTechOnChromecastPlay = true
    @seeking = true
    @seekMedia(currentTime)

  onClick: ->
    if @casting
      @stopCasting()
    else
      @player_.pause() 
      @doLaunch()
