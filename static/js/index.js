$(document).ready(function() {
  $(".navbar-burger").click(function() {
    $(".navbar-burger").toggleClass("is-active");
    $(".navbar-menu").toggleClass("is-active");
  });

  initOverviewVideoToggle();
  initVideoCarousel({
    trackId: "#sim-carousel-track",
    counterId: "#sim-rollout-counter",
    prevId: "#sim-prev",
    nextId: "#sim-next",
    basePath: "./static/videos/sim/",
    tasks: SIM_TASKS
  });
  initVideoCarousel({
    trackId: "#real-carousel-track",
    counterId: "#real-rollout-counter",
    prevId: "#real-prev",
    nextId: "#real-next",
    basePath: "./static/videos/real/",
    tasks: REAL_TASKS,
    mainLabel: "DSBC (Ours)",
    variants: [
      { label: "Base VLA", basePath: "./static/videos/real_base/" },
      { label: "Standard Flow BC", basePath: "./static/videos/real_diffusion_bc/" }
    ]
  });
  initVideoAspectFromMetadata();
  initTableOfContents();
});

// Left-rail table of contents: highlight (expand + un-grey) the section whose
// top has scrolled past a trigger line near the top of the viewport, and hide
// the whole rail until the first listed section is reached.
function initTableOfContents() {
  var nav = document.getElementById("toc-nav");
  if (!nav) { return; }
  var secs = Array.prototype.slice.call(nav.querySelectorAll(".toc-item")).map(function(item) {
    var anchor = document.getElementById(item.getAttribute("href").slice(1));
    return { item: item, section: anchor ? anchor.closest("section") : null };
  }).filter(function(s) { return s.section; });

  function update() {
    var trigger = window.scrollY + window.innerHeight * 0.35;
    var current = null;
    secs.forEach(function(s) { if (s.section.offsetTop <= trigger) { current = s; } });
    secs.forEach(function(s) { s.item.classList.toggle("active", s === current); });
    nav.style.opacity = current ? "1" : "0";
    nav.style.pointerEvents = current ? "auto" : "none";
  }

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

// Hide the native controls (scrubber + replay overlay) once a clip finishes so a
// done clip just holds its last frame; restore them when it plays again.
function hideControlsOnEnd(v) {
  v.addEventListener("ended", function() { v.controls = false; });
  v.addEventListener("play", function() { v.controls = true; });
}

function capitalizeLabel(label) {
  if (!label) {
    return "";
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function setAspectFromVideo(videoEl, wrapperEl) {
  if (!videoEl || !wrapperEl || !videoEl.videoWidth || !videoEl.videoHeight) {
    return;
  }
  wrapperEl.style.aspectRatio = videoEl.videoWidth + " / " + videoEl.videoHeight;
}

function initVideoAspectFromMetadata() {
  $(".video-card .video-aspect video").each(function() {
    var video = this;
    var wrapper = video.parentElement;
    function update() {
      setAspectFromVideo(video, wrapper);
    }
    if (video.readyState >= 1) {
      update();
    }
    video.addEventListener("loadedmetadata", update);
  });
}

var SIM_TASKS = [
  { file: "13-True-put_the_black_bowl_at_the_front_on_the_plate-13-epid_22-seed_0.mp4", label: "put the black bowl at the front on the plate" },
  { file: "31-True-put_the_black_bowl_on_top_of_the_cabinet-31-epid_25-seed_0.mp4", label: "put the black bowl on top of the cabinet" },
  { file: "35-True-open_the_microwave-35-epid_10-seed_0.mp4", label: "open the microwave" },
  { file: "41-True-put_the_frying_pan_on_top_of_the_cabinet-41-epid_0-seed_0.mp4", label: "put the frying pan on top of the cabinet" },
  { file: "43-True-put_the_white_bowl_on_top_of_the_cabinet-43-epid_12-seed_0.mp4", label: "put the white bowl on top of the cabinet" },
  { file: "44-True-turn_on_the_stove-44-epid_0-seed_0.mp4", label: "turn on the stove" },
  { file: "49-True-pick_up_the_tomato_sauce_and_put_it_in_the_basket-49-epid_2-seed_0.mp4", label: "pick up the tomato sauce and put it in the basket" },
  { file: "52-True-pick_up_the_milk_and_put_it_in_the_basket-52-epid_42-seed_0.mp4", label: "pick up the milk and put it in the basket" },
  { file: "69-True-put_the_chocolate_pudding_to_the_left_of_the_plate-69-epid_0-seed_0.mp4", label: "put the chocolate pudding to the left of the plate" },
  { file: "73-True-pick_up_the_book_and_place_it_in_the_front_compartment_of_the_caddy-73-epid_12-seed_0.mp4", label: "pick up the book and place it in the front compartment of the caddy" },
  { file: "74-True-pick_up_the_book_and_place_it_in_the_left_compartment_of_the_caddy-74-epid_0-seed_0.mp4", label: "pick up the book and place it in the left compartment of the caddy" },
  { file: "75-True-pick_up_the_book_and_place_it_in_the_right_compartment_of_the_caddy-75-epid_11-seed_0.mp4", label: "pick up the book and place it in the right compartment of the caddy" },
  { file: "78-True-pick_up_the_book_and_place_it_in_the_front_compartment_of_the_caddy-78-epid_45-seed_0.mp4", label: "pick up the book and place it in the front compartment of the caddy" },
  { file: "79-True-pick_up_the_book_and_place_it_in_the_left_compartment_of_the_caddy-79-epid_0-seed_0.mp4", label: "pick up the book and place it in the left compartment of the caddy" },
  { file: "81-True-pick_up_the_book_and_place_it_in_the_front_compartment_of_the_caddy-81-epid_10-seed_0.mp4", label: "pick up the book and place it in the front compartment of the caddy" }
];

var REAL_TASKS = [
  { file: "put_the_bread_on_the_plate.mp4", label: "put the bread on the plate" },
  { file: "put_the_plate_on_the_table.mp4", label: "put the plate on the table" },
  { file: "open_the_drawer_and_put_the_carrot_in_it.mp4", label: "open the drawer and put the carrot in it" },
  { file: "put_the_egg_in_the_steamer_basket.mp4", label: "put the egg in the steamer basket" },
  { file: "stack_the_cups_on_the_table.mp4", label: "stack the cups on the table" },
  { file: "hang_the_towel_on_the_black_stand.mp4", label: "hang the towel on the black stand" }
];

function initVideoCarousel(opts) {
  var $track = $(opts.trackId);
  var $counter = $(opts.counterId);
  var $prev = $(opts.prevId);
  var $next = $(opts.nextId);

  if (!$track.length || !$prev.length || !$next.length) {
    return;
  }

  var tasks = opts.tasks.map(function(entry) {
    return {
      file: entry.file,
      label: capitalizeLabel(entry.label)
    };
  });

  if (!tasks.length) {
    return;
  }

  var $viewport = $track.closest(".sim-carousel").find(".sim-carousel-viewport");
  var basePath = opts.basePath;
  var variants = opts.variants || [];   // extra method clips shown under the main
  var mainLabel = opts.mainLabel || ""; // label for the main (top) clip
  var n = tasks.length;
  var CLONES = 2; // peek cushion on each side for seamless wrap

  function makeCard(task) {
    // Multi-method card: main clip on top (labeled "Ours"), the two comparison
    // clips half-size underneath. Same filename in each variant's basePath.
    if (variants.length) {
      var $card = $(
        '<div class="sim-carousel-card rollout-multi">' +
          '<div class="rollout-cell rollout-main">' +
            '<div class="video-aspect ar169"><video controls muted playsinline preload="metadata"></video></div>' +
            '<p class="method-label ours">' + mainLabel + '</p>' +
          '</div>' +
          '<div class="rollout-variants"></div>' +
        '</div>'
      );
      var main = $card.find(".rollout-main video")[0];
      main.src = basePath + task.file;
      main.addEventListener("ended", function() {
        if ($card.hasClass("is-active")) { step(1); }
      });
      hideControlsOnEnd(main);
      var $vars = $card.find(".rollout-variants");
      variants.forEach(function(variant) {
        var $cell = $(
          '<div class="rollout-cell rollout-variant">' +
            '<div class="video-aspect ar169"><video controls muted playsinline preload="metadata"></video></div>' +
            '<p class="method-label"></p>' +
          '</div>'
        );
        var vv = $cell.find("video")[0];
        vv.src = variant.basePath + task.file;
        hideControlsOnEnd(vv);
        $cell.find("p").text(variant.label);
        $vars.append($cell);
      });
      return $card;
    }

    var $card = $(
      '<div class="sim-carousel-card">' +
        '<div class="video-aspect sim-video-aspect">' +
          '<video controls playsinline preload="metadata"></video>' +
        '</div>' +
        '<p class="figure-caption video-card-caption has-text-centered"></p>' +
      '</div>'
    );
    var video = $card.find("video")[0];
    video.src = basePath + task.file;
    $card.find("p").text(task.label);
    video.addEventListener("loadedmetadata", function() {
      applySharedAspect(video.videoWidth, video.videoHeight);
    });
    // auto-advance to the next clip when the active one finishes playing
    video.addEventListener("ended", function() {
      if ($card.hasClass("is-active")) { step(1); }
    });
    hideControlsOnEnd(video);
    return $card;
  }

  // All sim clips share the same dimensions; let the first that loads
  // fix one aspect ratio for every card so nothing resizes/flickers.
  var aspectSet = false;
  function applySharedAspect(w, h) {
    if (aspectSet || !w || !h) { return; }
    aspectSet = true;
    $track.find(".sim-video-aspect").css("aspect-ratio", w + " / " + h);
  }

  // Build order: [last CLONES] + [all] + [first CLONES] for an infinite loop.
  var order = [];
  for (var i = n - CLONES; i < n; i++) { order.push(i); }
  for (var i = 0; i < n; i++) { order.push(i); }
  for (var i = 0; i < CLONES; i++) { order.push(i); }
  order.forEach(function(idx) { $track.append(makeCard(tasks[idx])); });

  var $cards = $track.find(".sim-carousel-card");
  var pos = CLONES; // track position of the active (centered) card
  var animating = false;

  // dot pagination ("meatball" style): one dot per logical rollout, active
  // highlighted, click to jump straight to that rollout.
  var $dots = [];
  $counter.empty();
  for (var di = 0; di < n; di++) {
    var $dot = $('<button type="button" class="sim-dot"></button>');
    $dot.attr("aria-label", "Go to rollout " + (di + 1));
    (function(idx) { $dot.on("click", function() { goTo(idx); }); })(di);
    $counter.append($dot);
    $dots.push($dot);
  }

  function position(animate) {
    var card = $cards[pos];
    if (!card) { return; }
    var vw = $viewport[0].clientWidth;
    var cardW = card.offsetWidth;
    var offset = vw / 2 - (card.offsetLeft + cardW / 2);
    $track[0].style.transition = animate ? "" : "none";
    $track[0].style.transform = "translateX(" + offset + "px)";

    $cards.removeClass("is-active");
    $(card).addClass("is-active");

    var logical = ((pos - CLONES) % n + n) % n;
    $dots.forEach(function($d, i) { $d.toggleClass("is-active", i === logical); });
  }

  function playActive() {
    $cards.each(function() {
      var active = $(this).hasClass("is-active");
      $(this).find("video").each(function() {
        if (active) {
          this.muted = true; // muted so browsers allow autoplay
          var p = this.play();
          if (p && p.catch) { p.catch(function() {}); }
        } else {
          this.pause();
        }
      });
    });
  }

  function step(delta) {
    if (animating) { return; }
    animating = true;
    pos += delta;
    position(true);
    playActive();
  }

  function goTo(target) {
    if (animating) { return; }
    var logical = ((pos - CLONES) % n + n) % n;
    if (target === logical) { return; }
    animating = true;
    pos = CLONES + target;
    position(true);
    playActive();
  }

  $track.on("transitionend", function(e) {
    if (e.target !== $track[0]) { return; }
    animating = false;
    if (pos >= n + CLONES) {
      pos -= n;
      position(false);
      playActive();
    } else if (pos < CLONES) {
      pos += n;
      position(false);
      playActive();
    }
  });

  $prev.on("click", function() { step(-1); });
  $next.on("click", function() { step(1); });
  $(window).on("resize", function() { position(false); });

  // Re-center once the first card has real dimensions, then autoplay it.
  position(false);
  $cards.eq(pos).find("video")[0].addEventListener("loadedmetadata", function() {
    position(false);
  });
  playActive();
}

function initOverviewVideoToggle() {
  var $toggle = $("#video-toggle");
  var $slider = $(".video-mode-slider");
  var $preview = $("#overview-video-preview");
  var $full = $("#overview-video-full");

  if (!$toggle.length) {
    return;
  }

  function updateCapsule() {
    var $active = $toggle.is(":checked") ? $slider.find(".on") : $slider.find(".off");
    if (!$active.length) {
      return;
    }
    var sliderRect = $slider[0].getBoundingClientRect();
    var labelRect = $active[0].getBoundingClientRect();
    var left = labelRect.left - sliderRect.left;
    $slider[0].style.setProperty("--capsule-left", left + "px");
    $slider[0].style.setProperty("--capsule-width", labelRect.width + "px");
  }

  function showOverviewVideo() {
    if ($toggle.is(":checked")) {
      $preview.addClass("is-hidden");
      $full.removeClass("is-hidden");
      if ($full.is("video") && $preview.is("video")) {
        $preview[0].pause();
        $full[0].muted = false;
        $full[0].play();
      }
    } else {
      $full.addClass("is-hidden");
      $preview.removeClass("is-hidden");
      if ($preview.is("video") && $full.is("video")) {
        $full[0].pause();
        $preview[0].muted = true;
        $preview[0].play();
      }
    }
    updateCapsule();
  }

  $toggle.on("change", showOverviewVideo);
  $(window).on("resize", updateCapsule);
  showOverviewVideo();
}
