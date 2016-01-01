videojs.plugin "chromecast", (options) ->
  @chromecastComponent = new videojs.ChromecastComponent(@, options)
  @ready () => 
  	@controlBar.addChild @chromecastComponent
