// ==========================================================
    // CONFIGURATION
    // ==========================================================

    const BUILD_ID =
      "SIG2026-20261002-1805";

    console.log(
      "BUILD :",
      BUILD_ID
    );

    const PORTAL_URL =
      "https://saintongeromane.maps.arcgis.com";

    const CLIENT_ID =
      "uVV1afs1BldtPI0l";

    const WEBSCENE_ID =
      "a874e00cced24ca6becd5f307189fcb3";

    const AXE_ROUTE_ITEM_ID =
      "1328f11571aa43c4a62aec9c43f5824f";

    const WEB_STYLE =
      "EsriRealisticTransportationStyle";

    const ROAD_VERTICAL_OFFSET =
      0.10;

    // Le polygone d'eau n'est pas une surface d'accrochage
    // pour relative-to-scene. On remonte donc provisoirement
    // le bateau au-dessus du mesh / fond de rivière.
    // À ajuster si besoin après ton prochain test.
    const BOAT_VERTICAL_OFFSET =
      6.0;

    const HEADING_LOOK_AHEAD_METERS =
      4;

    // ----------------------------------------------------------
    // FILTRE DASHBOARD
    //
    // Exemple :
    // https://jide-gis.github.io/bus/?scenario=Crue%20F%C3%A9vrier%202026
    //
    // Le sélecteur du Dashboard peut fournir MERGE_SRC ici.
    // ----------------------------------------------------------

    const URL_PARAMS =
      new URLSearchParams(
        window.location.search
      );

    const DASHBOARD_SCENARIO =
      URL_PARAMS.get("scenario")
      ||
      URL_PARAMS.get("MERGE_SRC")
      ||
      "";

    // Anti-collision visuel.
    // Les véhicules qui convergent à moins de cette enveloppe
    // sont temporairement bloqués selon leur priorité ID_VEH.
    const SAFETY_RADIUS = {
      // Distance centre-à-centre minimale visée.
      // Valeurs volontairement conservatrices pour une démo.
      CAR: 7.0,
      BUS: 14.0,
      TRUCK: 17.0
    };

    const MODEL_BY_ID = {
      "01": "Bus",
      "02": "Audi_A6",
      "03": "BMW_3-Series",
      "04": "Ford_Edge",
      "05": "Semi_Trailer_Truck",
      "06": "Ford_Fiesta",
      "07": "Bus",
      "08": "Ford_Focus_Hatchback",
      "09": "Ford_Fusion",
      "10": "Ford_Mustang",
      "11": "Mercedes_S-Class",
      "12": "Toyota_Prius",
      "13": "Motorboat"
    };

    const FALLBACK_MODEL_BY_TYPE = {
      CAR: "Taxi",
      BUS: "Bus",
      TRUCK: "Delivery_Truck",
      BOAT: "Motorboat"
    };

    // ==========================================================
    // IMPORTS
    // ==========================================================

    const [
      esriConfig,
      OAuthInfo,
      identityManager,
      WebScene,
      SceneView,
      FeatureLayer,
      GraphicsLayer,
      Graphic,
      Point,
      WebStyleSymbol
    ] = await $arcgis.import([
      "@arcgis/core/config.js",
      "@arcgis/core/identity/OAuthInfo.js",
      "@arcgis/core/identity/IdentityManager.js",
      "@arcgis/core/WebScene.js",
      "@arcgis/core/views/SceneView.js",
      "@arcgis/core/layers/FeatureLayer.js",
      "@arcgis/core/layers/GraphicsLayer.js",
      "@arcgis/core/Graphic.js",
      "@arcgis/core/geometry/Point.js",
      "@arcgis/core/symbols/WebStyleSymbol.js"
    ]);

    esriConfig.portalUrl =
      PORTAL_URL;

    // ==========================================================
    // AUTHENTIFICATION
    // ==========================================================

    const oauthInfo =
      new OAuthInfo({
        appId:
          CLIENT_ID,

        portalUrl:
          PORTAL_URL,

        popup:
          false,

        flowType:
          "auto",

        preserveUrlHash:
          true
      });

    identityManager.registerOAuthInfos([
      oauthInfo
    ]);

    async function authenticate() {
      try {
        try {
          await identityManager.checkSignInStatus(
            PORTAL_URL + "/sharing"
          );

          console.log(
            "Utilisateur déjà authentifié."
          );
        }
        catch (error) {
          console.log(
            "Authentification nécessaire."
          );

          await identityManager.getCredential(
            PORTAL_URL + "/sharing"
          );
        }

        const url =
          new URL(window.location.href);

        if (
          url.searchParams.has("code") ||
          url.searchParams.has("state")
        ) {
          url.searchParams.delete("code");
          url.searchParams.delete("state");

          window.history.replaceState(
            {},
            document.title,
            url.pathname + (url.search || "") + url.hash
          );
        }
      }
      catch (error) {
        console.error(
          "Erreur authentification :",
          error
        );

        throw error;
      }
    }

    // ==========================================================
    // OUTILS
    // ==========================================================

    function normalizeId(value) {
      return String(
        value ?? ""
      )
        .trim()
        .padStart(2, "0");
    }

    function normalizeType(value) {
      return String(
        value ?? ""
      )
        .trim()
        .toUpperCase();
    }

    function distanceMeters(
      x1,
      y1,
      x2,
      y2,
      spatialReference
    ) {
      if (
        spatialReference.isGeographic
      ) {
        const R =
          6371008.8;

        const toRad =
          Math.PI / 180;

        const phi1 =
          y1 * toRad;

        const phi2 =
          y2 * toRad;

        const deltaPhi =
          (y2 - y1) * toRad;

        const deltaLambda =
          (x2 - x1) * toRad;

        const a =
          Math.sin(deltaPhi / 2) ** 2
          +
          Math.cos(phi1)
          *
          Math.cos(phi2)
          *
          Math.sin(deltaLambda / 2) ** 2;

        const c =
          2
          *
          Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
          );

        return R * c;
      }

      const dx =
        x2 - x1;

      const dy =
        y2 - y1;

      const metersPerUnit =
        spatialReference.metersPerUnit || 1;

      return (
        Math.sqrt(
          dx * dx +
          dy * dy
        )
        *
        metersPerUnit
      );
    }

    function bearingDegrees(
      x1,
      y1,
      x2,
      y2,
      spatialReference
    ) {
      if (
        !spatialReference.isGeographic
      ) {
        const dx =
          x2 - x1;

        const dy =
          y2 - y1;

        let angle =
          Math.atan2(
            dx,
            dy
          )
          *
          180
          /
          Math.PI;

        return (
          angle +
          360
        ) % 360;
      }

      const toRad =
        Math.PI / 180;

      const toDeg =
        180 / Math.PI;

      const phi1 =
        y1 * toRad;

      const phi2 =
        y2 * toRad;

      const deltaLambda =
        (x2 - x1) * toRad;

      const y =
        Math.sin(deltaLambda)
        *
        Math.cos(phi2);

      const x =
        Math.cos(phi1)
        *
        Math.sin(phi2)
        -
        Math.sin(phi1)
        *
        Math.cos(phi2)
        *
        Math.cos(deltaLambda);

      let angle =
        Math.atan2(
          y,
          x
        )
        *
        toDeg;

      return (
        angle +
        360
      ) % 360;
    }

    function shortestAngleDelta(
      from,
      to
    ) {
      return (
        (
          to -
          from +
          540
        ) % 360
      ) - 180;
    }

    function buildRoute(
      path,
      spatialReference
    ) {
      const segments = [];
      let totalLength = 0;

      for (
        let i = 0;
        i < path.length - 1;
        i++
      ) {
        const p1 =
          path[i];

        const p2 =
          path[i + 1];

        const length =
          distanceMeters(
            p1[0],
            p1[1],
            p2[0],
            p2[1],
            spatialReference
          );

        if (
          length <= 0.001
        ) {
          continue;
        }

        segments.push({
          p1:
            p1,

          p2:
            p2,

          length:
            length,

          startDistance:
            totalLength
        });

        totalLength +=
          length;
      }

      return {
        segments:
          segments,

        totalLength:
          totalLength
      };
    }

    function pointAtDistance(
      route,
      distance
    ) {
      distance =
        Math.max(
          0,
          Math.min(
            route.totalLength,
            distance
          )
        );

      let segment =
        route.segments[
          route.segments.length - 1
        ];

      for (
        const candidate
        of route.segments
      ) {
        if (
          distance >=
            candidate.startDistance
          &&
          distance <=
            candidate.startDistance +
            candidate.length
        ) {
          segment =
            candidate;

          break;
        }
      }

      const localDistance =
        distance -
        segment.startDistance;

      const t =
        Math.max(
          0,
          Math.min(
            1,
            localDistance /
            segment.length
          )
        );

      return {
        x:
          segment.p1[0]
          +
          (
            segment.p2[0] -
            segment.p1[0]
          )
          *
          t,

        y:
          segment.p1[1]
          +
          (
            segment.p2[1] -
            segment.p1[1]
          )
          *
          t
      };
    }

    function smoothHeading(
      route,
      distance,
      spatialReference
    ) {
      const beforeDistance =
        Math.max(
          0,
          distance -
          HEADING_LOOK_AHEAD_METERS
        );

      const afterDistance =
        Math.min(
          route.totalLength,
          distance +
          HEADING_LOOK_AHEAD_METERS
        );

      const before =
        pointAtDistance(
          route,
          beforeDistance
        );

      const after =
        pointAtDistance(
          route,
          afterDistance
        );

      return bearingDegrees(
        before.x,
        before.y,
        after.x,
        after.y,
        spatialReference
      );
    }

    function safetyRadius(
      type
    ) {
      return SAFETY_RADIUS[type] || 3.0;
    }

    // ==========================================================
    // EAU
    // ==========================================================
    //
    // Aucun traitement SDK volontairement.
    // Le rendu est celui enregistré dans la Web Scene.
    //
    // ==========================================================
    // EAU NATIVE + EFFETS MÉTÉO POUR SCÈNE LOCALE
    // ==========================================================

    function normalizeSlideText(
      value
    ) {
      return String(
        value || ""
      )
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .toLowerCase()
        .trim();
    }


    async function enhanceNativeWater(
      webscene
    ) {
      const liveWaterLayers =
        [];

      const layers =
        webscene.allLayers
          ?
          webscene.allLayers.toArray()
          :
          [];

      await Promise.allSettled(
        layers.map(
          function(layer) {
            return layer.load();
          }
        )
      );

      for (
        const layer
        of layers
      ) {
        try {
          if (
            !layer.renderer ||
            typeof layer.renderer.clone !== "function"
          ) {
            continue;
          }

          const renderer =
            layer.renderer.clone();

          let changed =
            false;

          function inspectSymbol(
            symbol
          ) {
            if (
              !symbol ||
              !symbol.symbolLayers
            ) {
              return;
            }

            symbol.symbolLayers.forEach(
              function(symbolLayer) {
                if (
                  symbolLayer.type !== "water"
                ) {
                  return;
                }

                // On ne touche ni à la couleur ni au matériau :
                // les reflets et jeux de lumière restent ceux d'Esri.
                symbolLayer.waterbodySize =
                  "large";

                symbolLayer.waveStrength =
                  "moderate";

                if (
                  symbolLayer.waveDirection == null
                ) {
                  symbolLayer.waveDirection =
                    35;
                }

                liveWaterLayers.push({
                  layer:
                    symbolLayer,

                  baseDirection:
                    Number(
                      symbolLayer.waveDirection
                    ) || 35
                });

                changed =
                  true;
              }
            );
          }

          inspectSymbol(
            renderer.symbol
          );

          renderer.uniqueValueInfos?.forEach(
            function(info) {
              inspectSymbol(
                info.symbol
              );
            }
          );

          renderer.classBreakInfos?.forEach(
            function(info) {
              inspectSymbol(
                info.symbol
              );
            }
          );

          if (
            changed
          ) {
            layer.renderer =
              renderer;
          }
        }
        catch (error) {
          console.warn(
            "Eau : couche ignorée :",
            layer.title,
            error
          );
        }
      }

      console.log(
        "Eau native animée :",
        liveWaterLayers.length,
        "WaterSymbol3DLayer."
      );

      if (
        liveWaterLayers.length === 0
      ) {
        return;
      }

      // Petit mouvement périodique de direction, très limité :
      // on conserve l'aspect natif, mais on force un changement
      // visible des reflets sans overlay graphique.
      let phase =
        0;

      window.setInterval(
        function() {
          phase +=
            0.20;

          const offset =
            Math.sin(
              phase
            )
            *
            7.5;

          liveWaterLayers.forEach(
            function(item) {
              item.layer.waveDirection =
                (
                  item.baseDirection +
                  offset +
                  360
                )
                %
                360;
            }
          );
        },
        150
      );
    }


    function createLocalWeatherController() {
      const canvas =
        document.getElementById(
          "weatherCanvas"
        );

      const flash =
        document.getElementById(
          "lightningFlash"
        );

      const ctx =
        canvas.getContext(
          "2d"
        );

      let active =
        false;

      let layers =
        [];

      let animationHandle =
        null;

      let lightningTimer =
        null;

      let lastFrameTime =
        0;

      let boltUntil =
        0;

      let bolt =
        null;


      function makeDrop(
        config
      ) {
        return {
          x:
            Math.random() *
            window.innerWidth,

          y:
            Math.random() *
            window.innerHeight,

          len:
            config.lenMin +
            Math.random() *
            (
              config.lenMax -
              config.lenMin
            ),

          speed:
            config.speedMin +
            Math.random() *
            (
              config.speedMax -
              config.speedMin
            ),

          alpha:
            config.alphaMin +
            Math.random() *
            (
              config.alphaMax -
              config.alphaMin
            ),

          width:
            config.widthMin +
            Math.random() *
            (
              config.widthMax -
              config.widthMin
            ),

          angle:
            config.angleMin +
            Math.random() *
            (
              config.angleMax -
              config.angleMin
            ),

          drift:
            (
              Math.random() -
              0.5
            ) *
            0.10,

          phase:
            Math.random() *
            Math.PI *
            2
        };
      }


      function buildRainLayers() {
        const w =
          window.innerWidth;

        layers = [
          {
            blur:
              3.0,

            opacity:
              0.50,

            count:
              Math.max(
                55,
                Math.round(
                  w /
                  22
                )
              ),

            config: {
              lenMin:
                10,

              lenMax:
                18,

              speedMin:
                260,

              speedMax:
                420,

              alphaMin:
                0.030,

              alphaMax:
                0.070,

              widthMin:
                0.45,

              widthMax:
                0.75,

              angleMin:
                0.58,

              angleMax:
                0.72
            }
          },

          {
            blur:
              1.7,

            opacity:
              0.70,

            count:
              Math.max(
                70,
                Math.round(
                  w /
                  16
                )
              ),

            config: {
              lenMin:
                16,

              lenMax:
                28,

              speedMin:
                420,

              speedMax:
                680,

              alphaMin:
                0.055,

              alphaMax:
                0.110,

              widthMin:
                0.65,

              widthMax:
                1.00,

              angleMin:
                0.62,

              angleMax:
                0.80
            }
          },

          {
            blur:
              0.8,

            opacity:
              0.92,

            count:
              Math.max(
                40,
                Math.round(
                  w /
                  30
                )
              ),

            config: {
              lenMin:
                28,

              lenMax:
                44,

              speedMin:
                720,

              speedMax:
                1050,

              alphaMin:
                0.080,

              alphaMax:
                0.150,

              widthMin:
                0.95,

              widthMax:
                1.45,

              angleMin:
                0.68,

              angleMax:
                0.88
            }
          }
        ];

        layers.forEach(
          function(layer) {
            layer.drops =
              Array.from(
                {
                  length:
                    layer.count
                },
                function() {
                  return makeDrop(
                    layer.config
                  );
                }
              );
          }
        );
      }


      function resize() {
        const dpr =
          Math.min(
            window.devicePixelRatio || 1,
            2
          );

        canvas.width =
          Math.max(
            1,
            Math.floor(
              window.innerWidth *
              dpr
            )
          );

        canvas.height =
          Math.max(
            1,
            Math.floor(
              window.innerHeight *
              dpr
            )
          );

        canvas.style.width =
          window.innerWidth +
          "px";

        canvas.style.height =
          window.innerHeight +
          "px";

        ctx.setTransform(
          dpr,
          0,
          0,
          dpr,
          0,
          0
        );

        buildRainLayers();
      }


      function resetDrop(
        drop,
        width
      ) {
        drop.y =
          -50 -
          Math.random() *
          180;

        drop.x =
          Math.random() *
          (
            width +
            140
          )
          -
          70;
      }


      function generateBolt() {
        const width =
          window.innerWidth;

        const height =
          window.innerHeight;

        const startX =
          width *
          (
            0.20 +
            Math.random() *
            0.60
          );

        const endY =
          height *
          (
            0.24 +
            Math.random() *
            0.16
          );

        const points = [
          {
            x:
              startX,

            y:
              -10
          }
        ];

        let x =
          startX;

        const segments =
          7 +
          Math.floor(
            Math.random() *
            3
          );

        for (
          let i = 1;
          i <= segments;
          i++
        ) {
          x +=
            (
              Math.random() -
              0.5
            )
            *
            24;

          points.push({
            x:
              x,

            y:
              endY *
              (
                i /
                segments
              )
          });
        }

        bolt = {
          points:
            points
        };

        boltUntil =
          performance.now() +
          160;
      }


      function drawBolt(
        now
      ) {
        if (
          !bolt ||
          now >
          boltUntil
        ) {
          return;
        }

        const alpha =
          Math.max(
            0,
            (
              boltUntil -
              now
            )
            /
            160
          );

        ctx.save();

        ctx.beginPath();

        ctx.moveTo(
          bolt.points[0].x,
          bolt.points[0].y
        );

        for (
          let i = 1;
          i < bolt.points.length;
          i++
        ) {
          ctx.lineTo(
            bolt.points[i].x,
            bolt.points[i].y
          );
        }

        ctx.strokeStyle =
          "rgba(235,245,255," +
          (
            alpha *
            0.24
          )
          +
          ")";

        ctx.lineWidth =
          0.9;

        ctx.shadowColor =
          "rgba(200,225,255,0.25)";

        ctx.shadowBlur =
          4;

        ctx.stroke();

        ctx.restore();
      }


      function drawAtmosphere(
        now
      ) {
        const width =
          window.innerWidth;

        const height =
          window.innerHeight;

        const pulse =
          0.018 *
          (
            1 +
            Math.sin(
              now *
              0.00045
            )
          );

        ctx.save();

        ctx.globalCompositeOperation =
          "screen";

        const topGradient =
          ctx.createLinearGradient(
            0,
            0,
            0,
            height *
            0.52
          );

        topGradient.addColorStop(
          0,
          "rgba(220,230,245," +
          (
            0.012 +
            pulse
          )
          +
          ")"
        );

        topGradient.addColorStop(
          0.35,
          "rgba(220,230,245,0.010)"
        );

        topGradient.addColorStop(
          1,
          "rgba(220,230,245,0)"
        );

        ctx.fillStyle =
          topGradient;

        ctx.fillRect(
          0,
          0,
          width,
          height *
          0.52
        );

        ctx.restore();
      }


      function drawRainLayer(
        layer,
        now,
        dt
      ) {
        const width =
          window.innerWidth;

        const height =
          window.innerHeight;

        const wind =
          0.16 +
          0.035 *
          Math.sin(
            now *
            0.00055
          );

        ctx.save();

        ctx.filter =
          layer.blur > 0
          ?
          "blur(" +
          layer.blur +
          "px)"
          :
          "none";

        ctx.lineCap =
          "round";

        ctx.globalCompositeOperation =
          "screen";

        layer.drops.forEach(
          function(drop) {
            drop.y +=
              drop.speed *
              dt;

            drop.x -=
              drop.speed *
              wind *
              dt;

            if (
              drop.y >
              height +
              70
              ||
              drop.x <
              -140
            ) {
              resetDrop(
                drop,
                width
              );
            }

            const angleShift =
              0.018 *
              Math.sin(
                now *
                0.0009 +
                drop.phase
              );

            const angle =
              drop.angle +
              angleShift +
              drop.drift;

            const dx =
              -Math.sin(
                angle
              )
              *
              drop.len;

            const dy =
              Math.cos(
                angle
              )
              *
              drop.len;

            const x2 =
              drop.x +
              dx;

            const y2 =
              drop.y +
              dy;

            const grad =
              ctx.createLinearGradient(
                drop.x,
                drop.y,
                x2,
                y2
              );

            grad.addColorStop(
              0,
              "rgba(225,235,255,0)"
            );

            grad.addColorStop(
              0.28,
              "rgba(225,235,255," +
              (
                drop.alpha *
                0.22 *
                layer.opacity
              )
              +
              ")"
            );

            grad.addColorStop(
              0.72,
              "rgba(225,235,255," +
              (
                drop.alpha *
                layer.opacity
              )
              +
              ")"
            );

            grad.addColorStop(
              1,
              "rgba(225,235,255,0)"
            );

            ctx.strokeStyle =
              grad;

            ctx.lineWidth =
              drop.width;

            ctx.beginPath();

            ctx.moveTo(
              drop.x,
              drop.y
            );

            ctx.lineTo(
              x2,
              y2
            );

            ctx.stroke();
          }
        );

        ctx.restore();
      }


      function drawRain(
        now
      ) {
        if (
          !active
        ) {
          return;
        }

        if (
          !lastFrameTime
        ) {
          lastFrameTime =
            now;
        }

        const dt =
          Math.min(
            (
              now -
              lastFrameTime
            )
            /
            1000,
            0.04
          );

        lastFrameTime =
          now;

        const width =
          window.innerWidth;

        const height =
          window.innerHeight;

        ctx.clearRect(
          0,
          0,
          width,
          height
        );

        drawAtmosphere(
          now
        );

        layers.forEach(
          function(layer) {
            drawRainLayer(
              layer,
              now,
              dt
            );
          }
        );

        drawBolt(
          now
        );

        animationHandle =
          requestAnimationFrame(
            drawRain
          );
      }


      function flashLightning() {
        if (
          !active
        ) {
          return;
        }

        const x =
          18 +
          Math.random() *
          64;

        flash.style.background =
          "radial-gradient(circle at " +
          x +
          "% 6%, " +
          "rgba(255,255,255,0.42) 0%, " +
          "rgba(210,230,255,0.15) 14%, " +
          "rgba(160,195,255,0.04) 32%, " +
          "rgba(255,255,255,0) 68%)";

        flash.style.display =
          "block";

        if (
          Math.random() <
          0.18
        ) {
          generateBolt();
        }
        else {
          bolt =
            null;
        }

        flash.animate(
          [
            {
              opacity:
                0
            },
            {
              opacity:
                0.16
            },
            {
              opacity:
                0.02
            },
            {
              opacity:
                0.08
            },
            {
              opacity:
                0
            }
          ],
          {
            duration:
              460,

            easing:
              "ease-out"
          }
        );

        scheduleLightning();
      }


      function scheduleLightning() {
        if (
          lightningTimer
        ) {
          window.clearTimeout(
            lightningTimer
          );
        }

        if (
          !active
        ) {
          return;
        }

        lightningTimer =
          window.setTimeout(
            flashLightning,
            8500 +
            Math.random() *
            8500
          );
      }


      function start() {
        if (
          active
        ) {
          return;
        }

        active =
          true;

        lastFrameTime =
          0;

        resize();

        canvas.style.display =
          "block";

        flash.style.display =
          "block";

        animationHandle =
          requestAnimationFrame(
            drawRain
          );

        scheduleLightning();
      }


      function stop() {
        active =
          false;

        canvas.style.display =
          "none";

        flash.style.display =
          "none";

        ctx.clearRect(
          0,
          0,
          window.innerWidth,
          window.innerHeight
        );

        if (
          animationHandle
        ) {
          cancelAnimationFrame(
            animationHandle
          );
        }

        if (
          lightningTimer
        ) {
          window.clearTimeout(
            lightningTimer
          );
        }
      }


      window.addEventListener(
        "resize",
        function() {
          if (
            active
          ) {
            resize();
          }
        }
      );


      return {
        start:
          start,

        stop:
          stop
      };
    }


    function createAmbientEffectsController() {
      const sun =
        document.getElementById(
          "sunRays"
        );

      const night =
        document.getElementById(
          "nightTint"
        );


      function setSun(
        enabled
      ) {
        sun.classList.toggle(
          "active",
          Boolean(
            enabled
          )
        );
      }


      function setNight(
        enabled
      ) {
        night.classList.toggle(
          "active",
          Boolean(
            enabled
          )
        );
      }


      return {
        setSun:
          setSun,

        setNight:
          setNight
      };
    }


    // ==========================================================
    // DIAPOSITIVES
    // ==========================================================

    function initSlides(
      webscene,
      view,
      roadVehicleLayer,
      boatLayer,
      weatherController,
      ambientController
    ) {
      const presentation =
        webscene.presentation;

      if (
        !presentation ||
        !presentation.slides ||
        presentation.slides.length === 0
      ) {
        console.log(
          "Aucune diapositive dans la Web Scene."
        );

        return;
      }

      const slideEntries =
        presentation.slides
          .toArray()
          .filter(
            function(slide) {
              return !slide.hidden;
            }
          );

      if (
        slideEntries.length === 0
      ) {
        return;
      }

      const controls =
        document.getElementById(
          "slideControls"
        );

      const prev =
        document.getElementById(
          "prevSlide"
        );

      const next =
        document.getElementById(
          "nextSlide"
        );

      const presentationDiv =
        document.getElementById(
          "slidePresentation"
        );

      const titleDiv =
        document.getElementById(
          "presentationTitle"
        );

      const descriptionDiv =
        document.getElementById(
          "presentationDescription"
        );

      let currentIndex =
        0;

      const normalizedTitles =
        slideEntries.map(
          function(slide) {
            return normalizeSlideText(
              slide?.title?.text
            );
          }
        );

      const rainStartIndex =
        normalizedTitles.findIndex(
          function(title) {
            return title.includes(
              "previsions 2050"
            );
          }
        );

      const rainStopIndex =
        normalizedTitles.findIndex(
          function(title) {
            return title.includes(
              "eclairer la gouvernance"
            );
          }
        );

      const starStartIndex =
        Math.max(
          0,
          slideEntries.length - 2
        );

      function applySlideEnhancements(
        index
      ) {
        const rainActive =
          rainStartIndex >= 0
          &&
          index >=
            rainStartIndex
          &&
          (
            rainStopIndex < 0
            ||
            index <
              rainStopIndex
          );

        const nightActive =
          index >=
          starStartIndex;

        const sunActive =
          index <=
          1;

        if (
          rainActive
        ) {
          weatherController.start();
        }
        else {
          weatherController.stop();
        }

        ambientController.setSun(
          sunActive
        );

        ambientController.setNight(
          nightActive
        );

        // Étoiles natives Esri uniquement : elles sont réellement
        // derrière le mesh et ne peuvent plus recouvrir les bâtiments.
        view.environment.starsEnabled =
          nightActive;

        if (
          nightActive
        ) {
          // En retirant l'atmosphère uniquement sur les deux dernières
          // slides, les étoiles natives ressortent sur le fond du ciel.
          view.environment.atmosphereEnabled =
            false;

          view.environment.background = {
            type:
              "color",

            color: [
              5,
              11,
              28,
              1
            ]
          };
        }

        console.log(
          "Effets slide :",
          index + 1,
          {
            rain:
              rainActive,

            sunRays:
              sunActive,

            night:
              nightActive,

            stars:
              nightActive
          }
        );
      }


      let slideTransitionRunning =
        false;

      function setSlideButtonsEnabled(
        enabled
      ) {
        prev.disabled =
          !enabled;

        next.disabled =
          !enabled;

        prev.style.opacity =
          enabled ? "1" : "0.55";

        next.style.opacity =
          enabled ? "1" : "0.55";

        prev.style.cursor =
          enabled ? "pointer" : "default";

        next.style.cursor =
          enabled ? "pointer" : "default";
      }

      function updateSlideText(
        slide,
        index
      ) {
        const title =
          slide?.title?.text
          ||
          (
            "Diapo " +
            (index + 1)
          );

        const description =
          slide?.description?.text
          ||
          "";

        const layout =
          slide?.layout
          ||
          "caption";

        titleDiv.textContent =
          title;

        descriptionDiv.textContent =
          description;

        presentationDiv.className =
          (
            layout === "cover" ||
            layout === "caption"
          )
          ?
          layout
          :
          "none";
      }

      async function applySlide(
        index
      ) {
        if (
          slideTransitionRunning
        ) {
          return;
        }

        slideTransitionRunning =
          true;

        setSlideButtonsEnabled(
          false
        );

        if (
          index < 0
        ) {
          index =
            slideEntries.length - 1;
        }

        if (
          index >=
          slideEntries.length
        ) {
          index =
            0;
        }

        currentIndex =
          index;

        updateSlideText(
          slideEntries[index],
          index
        );

        try {
          await slideEntries[
            index
          ].applyTo(
            view,
            {
              animate:
                true,

              duration:
                3600,

              maxDuration:
                5000,

              easing:
                "cubic-in-out"
            }
          );

          applySlideEnhancements(
            index
          );

          // Les couches d'animation ne font pas partie
          // des slides enregistrées : on les maintient visibles.
          roadVehicleLayer.visible =
            true;

          boatLayer.visible =
            true;
        }
        catch (error) {
          console.warn(
            "Erreur application diapo :",
            error
          );
        }
        finally {
          slideTransitionRunning =
            false;

          setSlideButtonsEnabled(
            true
          );
        }
      }

      prev.addEventListener(
        "click",
        function() {
          applySlide(
            currentIndex - 1
          );
        }
      );

      next.addEventListener(
        "click",
        function() {
          applySlide(
            currentIndex + 1
          );
        }
      );

      updateSlideText(
        slideEntries[0],
        0
      );

      applySlideEnhancements(
        0
      );

      controls.style.display =
        "flex";

      console.log(
        "Diapositives disponibles :",
        slideEntries.length
      );

      console.table(
        slideEntries.map(
          function(slide, index) {
            return {
              index:
                index + 1,

              id:
                slide.id,

              title:
                slide?.title?.text || "",

              description:
                slide?.description?.text || "",

              layout:
                slide?.layout || "caption"
            };
          }
        )
      );

      async function warmSlideLayers() {
        try {
          const ids =
            new Set();

          slideEntries.forEach(
            function(slide) {
              slide.visibleLayers?.forEach(
                function(ref) {
                  if (
                    ref?.id
                  ) {
                    ids.add(
                      ref.id
                    );
                  }
                }
              );
            }
          );

          const layers =
            webscene.allLayers
              ?
              webscene.allLayers.toArray()
              :
              [];

          const targets =
            layers.filter(
              function(layer) {
                return ids.has(
                  layer.id
                );
              }
            );

          await Promise.allSettled(
            targets.map(
              async function(layer) {
                try {
                  await layer.load();

                  await view.whenLayerView(
                    layer
                  );
                }
                catch (error) {
                  // Préchargement opportuniste : jamais bloquant.
                }
              }
            )
          );

          console.log(
            "Préchargement slides terminé :",
            targets.length,
            "couches préparées."
          );
        }
        catch (error) {
          console.warn(
            "Préchargement slides ignoré :",
            error
          );
        }
      }

      const scheduleWarmup =
        function() {
          warmSlideLayers();
        };

      if (
        "requestIdleCallback"
        in window
      ) {
        window.requestIdleCallback(
          scheduleWarmup,
          {
            timeout:
              2500
          }
        );
      }
      else {
        window.setTimeout(
          scheduleWarmup,
          1200
        );
      }
    }

    // ==========================================================
    // FILTRE SCÉNARIO REÇU DU DASHBOARD
    // ==========================================================

    function escapeSqlString(
      value
    ) {
      return String(
        value
      ).replace(
        /'/g,
        "''"
      );
    }


    async function applyDashboardScenarioFilter(
      webscene,
      scenarioValue
    ) {
      const scenario =
        String(
          scenarioValue || ""
        ).trim();

      if (
        !scenario
      ) {
        console.log(
          "Dashboard : aucun filtre scenario reçu."
        );

        return;
      }

      console.log(
        "Dashboard : filtre scenario reçu :",
        scenario
      );

      const escapedScenario =
        escapeSqlString(
          scenario
        );

      const layers =
        webscene.allLayers
          ?
          webscene.allLayers.toArray()
          :
          [];

      let filteredCount =
        0;

      for (
        const layer
        of layers
      ) {
        try {
          if (
            typeof layer.load === "function"
          ) {
            await layer.load();
          }

          const fields =
            layer.fields
            ||
            [];

          const scenarioField =
            fields.find(
              function(field) {
                return String(
                  field.name || ""
                ).toUpperCase() ===
                "SCENARIO";
              }
            );

          if (
            !scenarioField
          ) {
            continue;
          }

          if (
            !(
              "definitionExpression"
              in layer
            )
          ) {
            continue;
          }

          const scenarioExpression =
            scenarioField.name
            +
            " = '"
            +
            escapedScenario
            +
            "'";

          const existingExpression =
            String(
              layer.definitionExpression
              ||
              ""
            ).trim();

          layer.definitionExpression =
            existingExpression
            ?
            "("
            +
            existingExpression
            +
            ") AND ("
            +
            scenarioExpression
            +
            ")"
            :
            scenarioExpression;

          filteredCount +=
            1;

          console.log(
            "Filtre SCENARIO appliqué :",
            layer.title,
            "=>",
            layer.definitionExpression
          );
        }
        catch (error) {
          console.warn(
            "Filtre SCENARIO ignoré pour :",
            layer.title,
            error
          );
        }
      }

      console.log(
        "Nombre de couches filtrées par SCENARIO :",
        filteredCount
      );
    }


    // ==========================================================
    // PROGRAMME PRINCIPAL
    // ==========================================================

    async function main() {
      try {
        await authenticate();

        const weatherController =
          createLocalWeatherController();

        const ambientController =
          createAmbientEffectsController();

        const webscene =
          new WebScene({
            portalItem: {
              id:
                WEBSCENE_ID
            }
          });

        const roadVehicleLayer =
          new GraphicsLayer({
            title:
              "Véhicules animés",

            elevationInfo: {
              mode:
                "relative-to-ground",

              offset:
                ROAD_VERTICAL_OFFSET
            }
          });

        const boatLayer =
          new GraphicsLayer({
            title:
              "Bateau animé",

            elevationInfo: {
              mode:
                "relative-to-ground",

              offset:
                BOAT_VERTICAL_OFFSET
            }
          });

        webscene.addMany([
          roadVehicleLayer,
          boatLayer
        ]);

        const view =
          new SceneView({
            container:
              "viewDiv",

            map:
              webscene,

            qualityProfile:
              "high"
          });

        await view.when();

        // Les WaterSymbol3DLayer sont des surfaces d'eau animées.
        // On force explicitement les animations de la SceneView.
        view.animationsEnabled =
          true;

        console.log(
          "WebScene chargée."
        );

        console.log(
          "SCR SceneView WKID :",
          view.spatialReference.wkid,
          "latestWkid :",
          view.spatialReference.latestWkid
        );

        // Filtre transmis par le sélecteur du Dashboard.
        await applyDashboardScenarioFilter(
          webscene,
          DASHBOARD_SCENARIO
        );

        // Eau : on conserve le matériau/couleur/reflets natifs Esri
        // et on ajuste seulement les vagues.
        enhanceNativeWater(
          webscene
        ).catch(
          function(error) {
            console.warn(
              "Eau native : réglage ignoré :",
              error
            );
          }
        );

        // Navigation dans les diapositives directement depuis
        // l'application intégrée au Dashboard.
        initSlides(
          webscene,
          view,
          roadVehicleLayer,
          boatLayer,
          weatherController,
          ambientController
        );

        // ======================================================
        // AXEROUTE
        // ======================================================

        const axeLayer =
          new FeatureLayer({
            portalItem: {
              id:
                AXE_ROUTE_ITEM_ID
            },

            layerId:
              0,

            outFields: [
              "ID_VEH",
              "TYPE_V",
              "MODELE",
              "VITESSE",
              "DEPART_PC",
              "ACTIF"
            ]
          });

        await axeLayer.load();

        const query =
          axeLayer.createQuery();

        query.where =
          "ACTIF = 1";

        query.returnGeometry =
          true;

        query.outFields = [
          "ID_VEH",
          "TYPE_V",
          "MODELE",
          "VITESSE",
          "DEPART_PC",
          "ACTIF"
        ];

        query.outSpatialReference =
          view.spatialReference;

        const result =
          await axeLayer.queryFeatures(
            query
          );

        console.log(
          "Véhicules actifs trouvés :",
          result.features.length
        );

        if (
          result.features.length === 0
        ) {
          throw new Error(
            "Aucun véhicule ACTIF = 1 dans AxeRoute."
          );
        }

        // ======================================================
        // MODÈLES ESRI
        // ======================================================

        const symbolCache =
          new Map();

        async function fetchVehicleSymbol(
          symbolName,
          type
        ) {
          if (
            symbolCache.has(
              symbolName
            )
          ) {
            return symbolCache
              .get(symbolName)
              .clone();
          }

          try {
            const webStyleSymbol =
              new WebStyleSymbol({
                styleName:
                  WEB_STYLE,

                name:
                  symbolName
              });

            const resolved =
              await webStyleSymbol
                .fetchSymbol();

            symbolCache.set(
              symbolName,
              resolved.clone()
            );

            return resolved;
          }
          catch (error) {
            console.warn(
              "Modèle introuvable :",
              symbolName,
              "=> fallback",
              error
            );

            const fallbackName =
              FALLBACK_MODEL_BY_TYPE[type]
              ||
              "Taxi";

            const fallback =
              new WebStyleSymbol({
                styleName:
                  WEB_STYLE,

                name:
                  fallbackName
              });

            const resolved =
              await fallback
                .fetchSymbol();

            symbolCache.set(
              fallbackName,
              resolved.clone()
            );

            return resolved;
          }
        }

        // ------------------------------------------------------
        // Précharge tous les modèles en parallèle au lieu de les
        // télécharger l'un après l'autre pendant la création.
        // ------------------------------------------------------

        const modelsToWarm =
          new Map();

        for (
          const feature
          of result.features
        ) {
          const attrs =
            feature.attributes;

          const id =
            normalizeId(
              attrs.ID_VEH
            );

          const type =
            normalizeType(
              attrs.TYPE_V
            );

          const modelFromField =
            String(
              attrs.MODELE ?? ""
            ).trim();

          const symbolName =
            modelFromField
            ||
            MODEL_BY_ID[id]
            ||
            FALLBACK_MODEL_BY_TYPE[type]
            ||
            "Taxi";

          if (
            !modelsToWarm.has(
              symbolName
            )
          ) {
            modelsToWarm.set(
              symbolName,
              type
            );
          }
        }

        await Promise.allSettled(
          Array.from(
            modelsToWarm.entries()
          ).map(
            function(
              [symbolName, type]
            ) {
              return fetchVehicleSymbol(
                symbolName,
                type
              );
            }
          )
        );

        console.log(
          "Modèles 3D préchargés en parallèle :",
          modelsToWarm.size
        );

        // ======================================================
        // CRÉATION DES VÉHICULES
        // ======================================================

        const vehicles =
          [];

        for (
          const feature
          of result.features
        ) {
          try {
            const attrs =
              feature.attributes;

            const id =
              normalizeId(
                attrs.ID_VEH
              );

            const type =
              normalizeType(
                attrs.TYPE_V
              );

            const geometry =
              feature.geometry;

            if (
              !geometry ||
              !geometry.paths ||
              geometry.paths.length === 0 ||
              geometry.paths[0].length < 2
            ) {
              console.warn(
                "Route ignorée, géométrie invalide :",
                id
              );

              continue;
            }

            const route =
              buildRoute(
                geometry.paths[0],
                view.spatialReference
              );

            if (
              route.totalLength <= 0
            ) {
              continue;
            }

            const modelFromField =
              String(
                attrs.MODELE ?? ""
              ).trim();

            const symbolName =
              modelFromField
              ||
              MODEL_BY_ID[id]
              ||
              FALLBACK_MODEL_BY_TYPE[type]
              ||
              "Taxi";

            const speedRaw =
              Number(
                attrs.VITESSE
              );

            const speedKmh =
              Number.isFinite(
                speedRaw
              )
              &&
              speedRaw > 0
              ?
              speedRaw
              :
              (
                type === "BOAT"
                ? 15
                : 30
              );

            const departRaw =
              Number(
                attrs.DEPART_PC
              );

            const departPc =
              Number.isFinite(
                departRaw
              )
              ?
              Math.max(
                0,
                Math.min(
                  100,
                  departRaw
                )
              )
              :
              0;

            const currentDistance =
              route.totalLength
              *
              departPc
              /
              100;

            const position =
              pointAtDistance(
                route,
                currentDistance
              );

            const initialHeading =
              smoothHeading(
                route,
                currentDistance,
                view.spatialReference
              );

            const symbol =
              (
                await fetchVehicleSymbol(
                  symbolName,
                  type
                )
              ).clone();

            if (
              !symbol.symbolLayers ||
              symbol.symbolLayers.length === 0
            ) {
              continue;
            }

            const objectLayer =
              symbol.symbolLayers
                .getItemAt(0);

            objectLayer.heading =
              initialHeading;

            objectLayer.castShadows =
              true;

            // Bateau :
            // le modèle Esri a son origine proche de la ligne d'eau.
            // On force un ancrage plus bas afin de remonter visuellement
            // la coque par rapport à la surface.
            if (
              type === "BOAT"
            ) {
              objectLayer.anchor =
                "relative";

              objectLayer.anchorPosition = {
                x:
                  0,

                y:
                  0,

                z:
                  -0.50
              };

              if (
                Number.isFinite(
                  objectLayer.height
                )
              ) {
                objectLayer.height *=
                  1.20;
              }

              if (
                Number.isFinite(
                  objectLayer.width
                )
              ) {
                objectLayer.width *=
                  1.20;
              }

              if (
                Number.isFinite(
                  objectLayer.depth
                )
              ) {
                objectLayer.depth *=
                  1.20;
              }
            }

            const graphic =
              new Graphic({
                geometry:
                  new Point({
                    x:
                      position.x,

                    y:
                      position.y,

                    spatialReference:
                      view.spatialReference
                  }),

                symbol:
                  symbol,

                attributes: {
                  ID_VEH:
                    id,

                  TYPE_V:
                    type,

                  MODELE:
                    symbolName,

                  VITESSE:
                    speedKmh
                }
              });

            const targetLayer =
              type === "BOAT"
              ?
              boatLayer
              :
              roadVehicleLayer;

            targetLayer.add(
              graphic
            );

            const numericPriority =
              Number.parseInt(
                id,
                10
              );

            vehicles.push({
              key:
                id + "_A",

              id:
                id,

              type:
                type,

              symbolName:
                symbolName,

              speedKmh:
                speedKmh,

              speedMs:
                speedKmh / 3.6,

              route:
                route,

              currentDistance:
                currentDistance,

              currentPosition:
                position,

              graphic:
                graphic,

              priority:
                Number.isFinite(
                  numericPriority
                )
                ?
                numericPriority
                :
                9999,

              currentSpeedMs:
                speedKmh / 3.6,

              targetSpeedMs:
                speedKmh / 3.6,

              lastHeadingUpdate:
                0,

              lastRenderedHeading:
                initialHeading
            });

            console.log(
              "Créé :",
              id,
              type,
              symbolName,
              speedKmh + " km/h"
            );
          }
          catch (vehicleError) {
            console.error(
              "Erreur création véhicule :",
              feature.attributes,
              vehicleError
            );
          }
        }

        // ======================================================
        // DENSIFICATION DU TRAFIC x2
        // ======================================================
        //
        // On duplique uniquement les véhicules routiers.
        // Le second exemplaire démarre à +50 % de son trajet.
        // Aucun attribut supplémentaire n'est nécessaire.
        // ======================================================

        const originalRoadVehicles =
          vehicles.filter(
            function(vehicle) {
              return vehicle.type !== "BOAT";
            }
          );

        for (
          const sourceVehicle
          of originalRoadVehicles
        ) {
          try {
            const duplicateDistance =
              (
                sourceVehicle.currentDistance
                +
                sourceVehicle.route.totalLength
                *
                0.50
              )
              %
              sourceVehicle.route.totalLength;

            const duplicatePosition =
              pointAtDistance(
                sourceVehicle.route,
                duplicateDistance
              );

            const duplicateHeading =
              smoothHeading(
                sourceVehicle.route,
                duplicateDistance,
                view.spatialReference
              );

            const duplicateSymbol =
              sourceVehicle.graphic.symbol
                .clone();

            const duplicateSymbolLayer =
              duplicateSymbol.symbolLayers
                .getItemAt(0);

            duplicateSymbolLayer.heading =
              duplicateHeading;

            const duplicateGraphic =
              new Graphic({
                geometry:
                  new Point({
                    x:
                      duplicatePosition.x,

                    y:
                      duplicatePosition.y,

                    spatialReference:
                      view.spatialReference
                  }),

                symbol:
                  duplicateSymbol,

                attributes: {
                  ID_VEH:
                    sourceVehicle.id + "_B",

                  TYPE_V:
                    sourceVehicle.type,

                  MODELE:
                    sourceVehicle.symbolName,

                  VITESSE:
                    sourceVehicle.speedKmh
                }
              });

            roadVehicleLayer.add(
              duplicateGraphic
            );

            vehicles.push({
              key:
                sourceVehicle.id + "_B",

              id:
                sourceVehicle.id,

              type:
                sourceVehicle.type,

              symbolName:
                sourceVehicle.symbolName,

              speedKmh:
                sourceVehicle.speedKmh,

              speedMs:
                sourceVehicle.speedMs,

              route:
                sourceVehicle.route,

              currentDistance:
                duplicateDistance,

              currentPosition:
                duplicatePosition,

              graphic:
                duplicateGraphic,

              priority:
                sourceVehicle.priority +
                0.01,

              currentSpeedMs:
                sourceVehicle.speedMs,

              targetSpeedMs:
                sourceVehicle.speedMs,

              lastHeadingUpdate:
                0,

              lastRenderedHeading:
                duplicateHeading
            });
          }
          catch (duplicateError) {
            console.warn(
              "Duplication trafic ignorée pour :",
              sourceVehicle.id,
              duplicateError
            );
          }
        }

        console.log(
          "Trafic x2 activé :",
          vehicles.filter(
            function(vehicle) {
              return vehicle.type !== "BOAT";
            }
          ).length,
          "véhicules routiers +",
          vehicles.filter(
            function(vehicle) {
              return vehicle.type === "BOAT";
            }
          ).length,
          "bateau(x)."
        );


        if (
          vehicles.length === 0
        ) {
          throw new Error(
            "Aucun véhicule n'a pu être créé."
          );
        }

        // ======================================================
        // ORIENTATION
        // ======================================================

        function updateVehicleHeading(
          vehicle,
          targetHeading,
          currentTime
        ) {
          // Le clone/réaffectation du symbole 3D est coûteux.
          // 12,5 mises à jour/s suffisent visuellement pour le cap.
          if (
            currentTime -
            vehicle.lastHeadingUpdate <
            80
          ) {
            return;
          }

          vehicle.lastHeadingUpdate =
            currentTime;

          const delta =
            shortestAngleDelta(
              vehicle.lastRenderedHeading,
              targetHeading
            );

          if (
            Math.abs(delta) <
            1.0
          ) {
            return;
          }

          const rotatedSymbol =
            vehicle.graphic.symbol
              .clone();

          const rotatedLayer =
            rotatedSymbol
              .symbolLayers
              .getItemAt(0);

          rotatedLayer.heading =
            targetHeading;

          vehicle.graphic.symbol =
            rotatedSymbol;

          vehicle.lastRenderedHeading =
            targetHeading;
        }

        // ======================================================
        // ANTI-COLLISION VISUEL
        // ======================================================

        function collisionThreshold(
          vehicleA,
          vehicleB
        ) {
          return Math.max(
            safetyRadius(
              vehicleA.type
            ),
            safetyRadius(
              vehicleB.type
            )
          );
        }

        function vehiclePriorityRank(
          vehicle
        ) {
          // Priorité de circulation :
          // 0 = BUS / TRUCK
          // 1 = CAR
          // Les bateaux sont exclus de l'anti-collision routier.
          if (
            vehicle.type === "BUS"
            ||
            vehicle.type === "TRUCK"
          ) {
            return 0;
          }

          return 1;
        }


        function chooseBlockedVehicle(
          vehicleA,
          vehicleB
        ) {
          const rankA =
            vehiclePriorityRank(
              vehicleA
            );

          const rankB =
            vehiclePriorityRank(
              vehicleB
            );

          // Le rang le plus faible passe en premier.
          if (
            rankA <
            rankB
          ) {
            return vehicleB;
          }

          if (
            rankB <
            rankA
          ) {
            return vehicleA;
          }

          // À priorité égale, l'ID le plus faible garde la priorité.
          return vehicleA.priority <=
            vehicleB.priority
            ?
            vehicleB
            :
            vehicleA;
        }

        const roadVehicles =
          vehicles.filter(
            function(vehicle) {
              return vehicle.type !== "BOAT";
            }
          );

        let blockedVehicles =
          new Set();

        let lastCollisionCheck =
          0;

        function updateCollisionState(
          currentTime
        ) {
          // ~12,5 Hz : suffisant pour l'anticipation, tout en gardant
          // une animation fluide avec le trafic doublé.
          if (
            currentTime -
            lastCollisionCheck <
            80
          ) {
            return;
          }

          lastCollisionCheck =
            currentTime;

          const newBlocked =
            new Set();

          // On échantillonne les 1,8 prochaines secondes.
          // Cela détecte aussi deux véhicules qui se croisent
          // entre "maintenant" et la position finale de prédiction.
          const sampleTimes = [
            0.30,
            0.60,
            0.90,
            1.20,
            1.50,
            1.80
          ];

          for (
            let i = 0;
            i < roadVehicles.length;
            i++
          ) {
            for (
              let j = i + 1;
              j < roadVehicles.length;
              j++
            ) {
              const vehicleA =
                roadVehicles[i];

              const vehicleB =
                roadVehicles[j];

              const threshold =
                collisionThreshold(
                  vehicleA,
                  vehicleB
                );

              const distanceNow =
                distanceMeters(
                  vehicleA.currentPosition.x,
                  vehicleA.currentPosition.y,
                  vehicleB.currentPosition.x,
                  vehicleB.currentPosition.y,
                  view.spatialReference
                );

              let minFutureDistance =
                distanceNow;

              for (
                const t
                of sampleTimes
              ) {
                const predictedDistanceA =
                  (
                    vehicleA.currentDistance
                    +
                    vehicleA.currentSpeedMs
                    *
                    t
                  )
                  %
                  vehicleA.route.totalLength;

                const predictedDistanceB =
                  (
                    vehicleB.currentDistance
                    +
                    vehicleB.currentSpeedMs
                    *
                    t
                  )
                  %
                  vehicleB.route.totalLength;

                const predictedA =
                  pointAtDistance(
                    vehicleA.route,
                    predictedDistanceA
                  );

                const predictedB =
                  pointAtDistance(
                    vehicleB.route,
                    predictedDistanceB
                  );

                const sampleDistance =
                  distanceMeters(
                    predictedA.x,
                    predictedA.y,
                    predictedB.x,
                    predictedB.y,
                    view.spatialReference
                  );

                minFutureDistance =
                  Math.min(
                    minFutureDistance,
                    sampleDistance
                  );
              }

              const conflictAhead =
                minFutureDistance <
                threshold;

              const alreadyTooClose =
                distanceNow <
                threshold *
                0.90;

              if (
                conflictAhead ||
                alreadyTooClose
              ) {
                const loser =
                  chooseBlockedVehicle(
                    vehicleA,
                    vehicleB
                  );

                newBlocked.add(
                  loser.key
                );
              }
            }
          }

          blockedVehicles =
            newBlocked;
        }

        // ======================================================
        // ANIMATION
        // ======================================================

        let lastFrameTime =
          performance.now();

        console.log(
          "Animation démarrée :",
          vehicles.length,
          "véhicules"
        );

        function moveToward(
          current,
          target,
          maxDelta
        ) {
          if (
            current <
            target
          ) {
            return Math.min(
              current +
              maxDelta,
              target
            );
          }

          return Math.max(
            current -
            maxDelta,
            target
          );
        }

        function animate(
          currentTime
        ) {
          try {
            let dt =
              (
                currentTime -
                lastFrameTime
              )
              /
              1000;

            lastFrameTime =
              currentTime;

            // Évite les bonds après changement d'onglet.
            dt =
              Math.min(
                dt,
                0.05
              );

            updateCollisionState(
              currentTime
            );

            for (
              const vehicle
              of vehicles
            ) {
              const isBlocked =
                vehicle.type !== "BOAT"
                &&
                blockedVehicles.has(
                  vehicle.key
                );

              vehicle.targetSpeedMs =
                isBlocked
                ?
                0
                :
                vehicle.speedMs;

              // Freinage plus franc que l'accélération :
              // pas d'arrêt instantané, donc mouvement plus naturel.
              const rate =
                vehicle.targetSpeedMs <
                vehicle.currentSpeedMs
                ?
                10.0
                :
                2.8;

              vehicle.currentSpeedMs =
                moveToward(
                  vehicle.currentSpeedMs,
                  vehicle.targetSpeedMs,
                  rate * dt
                );

              vehicle.currentDistance =
                (
                  vehicle.currentDistance
                  +
                  vehicle.currentSpeedMs
                  *
                  dt
                )
                %
                vehicle.route.totalLength;

              const position =
                pointAtDistance(
                  vehicle.route,
                  vehicle.currentDistance
                );

              vehicle.currentPosition =
                position;

              vehicle.graphic.geometry =
                new Point({
                  x:
                    position.x,

                  y:
                    position.y,

                  spatialReference:
                    view.spatialReference
                });

              const targetHeading =
                smoothHeading(
                  vehicle.route,
                  vehicle.currentDistance,
                  view.spatialReference
                );

              updateVehicleHeading(
                vehicle,
                targetHeading,
                currentTime
              );
            }

            requestAnimationFrame(
              animate
            );
          }
          catch (animationError) {
            console.error(
              "Erreur animation :",
              animationError
            );
          }
        }

        requestAnimationFrame(
          animate
        );
      }
      catch (error) {
        console.error(
          "ERREUR GÉNÉRALE :",
          error
        );
      }
    }

    main();
