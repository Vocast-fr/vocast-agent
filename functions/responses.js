const {
  Image,
  MediaObject,
  SimpleResponse,
  Suggestions
} = require('actions-on-google')
const { get, sample } = require('lodash')
const fetch = require('superagent')

const admin = require('firebase-admin')
const db = admin.firestore()
db.settings({ timestampsInSnapshots: true })

const { getRandomRadioForChip } = require('./utils')

const EPISODES_URL = 'https://api.spreaker.com/v2/shows/2886866/episodes'
const VOCAZAP_URL = 'https://vocazap.voca.st'

const helpResponses = conv => {
  conv.ask(
    new SimpleResponse(
      sample([
        {
          text:
            'Avec cette appli conversationnelle, vous pouvez écouter le podcast Des Ondes Vocast ou générer des zappings radio et tenter de gagner de gagner des cadeaux en jouant au Vocazap ! Que souhaitez-vous ?',
          speech:
            'Avec cette appli conversationnelle, vous pouvez écouter le podcast Des Ondes Vocast ou générer des zappings radio et tenter de gagner de gagner des cadeaux en jouant au Vocazap ! Que souhaitez-vous ?'
        },
        {
          text:
            "Vous pouvez demander à diffuser un épisode Des Ondes Vocast ou bien générer un zapping radio, avec le Vocazap. C'est  à vous ;)",
          speech:
            "Vous pouvez demander à diffuser un épisode Des Ondes Vocast ou bien générer un zapping radio, avec le Vocazap. C'est  à vous "
        },
        {
          text:
            "Ensemble, nous pouvons écouter un podcast Des Ondes Vocast ou bien jouer au Vocazap ! Qu'est-ce que vous ferait plaisir ?",
          speech:
            "Ensemble, nous pouvons écouter un podcast Des Ondes Vocast ou bien jouer au Vocazap ! Qu'est-ce que vous ferait plaisir ?"
        }
      ])
    )
  )
  suggestionsResponse(conv)
}

const podcastResponse = (conv, params, fullEpisode, episode) => {
  if (
    !conv.surface.capabilities.has('actions.capability.MEDIA_RESPONSE_AUDIO')
  ) {
    conv.ask(
      new SimpleResponse({
        text:
          "Vous ne pouvez pas écouter de podcasts sur cet appareil. Mais vous pouvez lancer un Vocazap. Dites 'Vocazap' suivi de la radio de votre choix. C'est à vous.",
        speech:
          "Vous ne pouvez pas écouter de podcasts sur cet appareil. Mais vous pouvez lancer un Vocazap. Dites 'Vocazap' suivi de la radio de votre choix. C'est à vous."
      })
    )
  } else {
    if (!conv.user.storage.played) {
      conv.user.storage.played = { vocazaps: [], episodes: [] }
    }

    return fetch(EPISODES_URL).then(async r => {
      const selectedEpisode = r.body.response.items.find(item => {
        const { episode_id, title } = item || {}
        const alreadyPlayed = conv.user.storage.played.episodes.includes(
          episode_id
        )

        console.log(
          'Compare',
          { episode_id, episode },
          `${episode_id}` === `${episode}`
        )

        const episodeChoice = `${episode_id}` === `${episode}`

        const titleOkAccordingParams =
          !fullEpisode && params.extraits && params.extraits.length
            ? title.includes(params.extraits)
            : title.includes(':') === false

        return (
          episodeChoice ||
          (!episode && alreadyPlayed === false && titleOkAccordingParams)
        )
      })

      const { episode_id, image_url, published_at, title } =
        selectedEpisode || {}

      console.log({ selectedEpisode })

      if (episode_id) {
        conv.user.storage.played.episodes.push(episode_id)
        conv.user.storage.lastPlayed = {
          type: episode ? 'choice' : fullEpisode ? 'dov-full' : params.extraits,
          media_id: episode_id
        }

        await db.runTransaction(t => {
          t.set(db.collection('dov_plays').doc(`${+new Date()}`), {
            fullEpisode: !!fullEpisode,
            params: params || {},
            selectedEpisode: title,
            email: get(conv, 'user.storage.userInfos.email', false)
          })
          return Promise.resolve('Wrote in DB')
        })

        conv.ask(
          new SimpleResponse({
            text: `Je mets l'épisode '${title}' du podcast Des Ondes Vocast`,
            speech: `Je mets l'épisode '${title}' du podcast Des Ondes Vocast`
          })
        )
        conv.ask(
          new MediaObject({
            name: `${title} - Des Ondes Vocast`,
            url: `https://api.spreaker.com/v2/episodes/${episode_id}/play.mp3`,
            description: `Date de publication : ${published_at}`,
            icon: new Image({
              url: image_url,
              alt: title
            })
          })
        )
      } else {
        console.warn(
          "Plus d'épisodes",
          params,
          get(conv, 'user.storage.played.episodes'),
          get(conv, 'user.storage.userInfos.email')
        )
        conv.ask(
          new SimpleResponse({
            text: `Il n'y a plus d'épisodes disponibles pour vous. Dites 'Supprimer les données' pour que l'application ne prenne plus en compte votre historique actuel`,
            speech: `Il n'y a plus d'épisodes disponibles pour vous. Dites 'Supprimer les données' pour que l'application ne prenne plus en compte votre historique actuel`
          })
        )
      }
      if (conv.screen) {
        conv.ask(
          new Suggestions([
            'Suppr hist lecture',
            `Vocazap sur ${getRandomRadioForChip()}`,
            'Quitter'
          ])
        )
      }
    })
  }
}

const suggestionsResponse = conv => {
  if (conv.screen) {
    conv.ask(
      new Suggestions([
        `Vocazap sur ${getRandomRadioForChip()}`,
        'Liste épisodes'
      ])
    )
  }
}

const vocazapResponse = (conv, radio) => {
  return fetch(VOCAZAP_URL).then(async r => {
    const { zap_id, zap_url, name } = r.body.zap

    if (!conv.user.storage.played) {
      conv.user.storage.played = { vocazaps: [], episodes: [] }
    }

    conv.user.storage.played.vocazaps.push(zap_id)
    conv.user.storage.lastPlayed = {
      type: 'vocazap',
      media_id: zap_id
    }

    if (radio) {
      conv.user.storage.vocaPlays = conv.user.storage.vocaPlays
        ? conv.user.storage.vocaPlays + 1
        : 1

      const winning = name.trim().toLowerCase() === radio.trim().toLowerCase()

      await db.runTransaction(t => {
        t.set(db.collection('vocazap').doc(`${+new Date()}`), {
          email: conv.user.storage.userInfos.email,
          zap_radio: name,
          user_radio: radio,
          winning,
          nbPlays: conv.user.storage.vocaPlays
        })
        return Promise.resolve('Wrote in DB')
      })

      if (winning) {
        conv.ask(
          `Vous avez lancé le Vocazap avec la radio ${radio}... Félicitations ! Vous avez gagné une enceinte connectée ! Nous allons vous contacter par mail d'ici peu pour que vous puissiez recevoir votre lot.`
        )
        console.error(
          'WOOOOOOOOOOON',
          conv.user.storage.userInfos.email,
          r.body.zap,
          radio
        )
      } else {
        conv.ask(
          `Vous avez lancé le Vocazap avec la radio ${radio}. Le premier extrait du zap est issu de la radio ${name}... Vous avez perdu ! Mais vous pourrez retenter votre chance !`
        )
      }
    }

    if (
      !conv.surface.capabilities.has('actions.capability.MEDIA_RESPONSE_AUDIO')
    ) {
      conv.ask(
        new SimpleResponse({
          speech: `<speak>Je vous diffuse le Vocazap. <audio src="${zap_url}">[Vocazap]</audio>.`,
          text: 'Et voici le Vocazap.'
        })
      )
    } else {
      conv.ask(
        new SimpleResponse({
          speech: `Et voici le Vocazap généré.`,
          text: `Et voici le Vocazap généré.`
        })
      )
      conv.ask(
        new MediaObject({
          name: 'Vocazap',
          url: zap_url,
          description:
            '4 extraits de 15 secondes, issus de radios prises au hasard',
          icon: new Image({
            url:
              'https://s3.eu-west-3.amazonaws.com/vocast/logo-vocast-1400.png',
            alt: 'Vocazap'
          })
        })
      )
      helpResponses(conv)
    }
  })
}

const welcomeResponse = conv => {
  if (!conv.user.last.seen) {
    conv.ask(
      new SimpleResponse(
        sample([
          {
            text: "Bienvenue dans l'univers Vocast !",
            speech: "Bienvenue dans l'univers Vocast !"
          }
        ])
      )
    )
  } else {
    conv.ask(
      new SimpleResponse(
        sample([
          {
            text: "Ravi de vous accueillir de nouveau dans l'univers Vocast !",
            speech: "Ravi de vous accueillir de nouveau dans l'univers Vocast !"
          },
          {
            text: "Bienvenue de nouveau dans l'univers de Vocast !",
            speech: "Bienvenue de nouveau dans l'univers de Vocast !"
          },
          {
            text: "Nous sommes contents de vous revoir dans l'univers Vocast !",
            speech:
              "Nous sommes contents de vous revoir dans l'univers Vocast !"
          }
        ])
      )
    )
  }

  conv.ask(
    new SimpleResponse(
      sample([
        {
          text:
            "Deux choses sont possibles : écouter le podcast Des Ondes Vocast ou bien générer un zapping radio permettant de gagner des enceintes connectées. Pour cela il suffit de demander 'le Vocazap'",
          speech:
            "Deux choses sont possibles : écouter le podcast Des Ondes Vocast ou bien générer un zapping radio permettant de gagner des enceintes connectées. Pour cela il suffit de demander 'le Vocazap'"
        },
        {
          text:
            'Avec Vocast et les assistants vocaux, vous pouvez écouter le podcast Des Ondes Vocast ou bien jouer au Vocazap pour tenter de gagner une enceinte connectée ! Que voulez-vous ?',
          speech:
            'Avec Vocast et les assistants vocaux, vous pouvez écouter le podcast Des Ondes Vocast ou bien jouer au Vocazap pour tenter de gagner une enceinte connectée ! Que voulez-vous ?'
        },
        {
          text:
            'On peut jouer ensemble au Vocazap ! Ou alors vous pouvez lancer le podcast Des Ondes Vocast ! Que voulez-vous ?',
          speech:
            'On peut jouer ensemble au Vocazap ! Ou alors vous pouvez lancer le podcast Des Ondes Vocast ! Que voulez-vous ?'
        }
      ])
    )
  )

  suggestionsResponse(conv)
}

module.exports = {
  helpResponses,
  podcastResponse,
  suggestionsResponse,
  vocazapResponse,
  welcomeResponse
}
