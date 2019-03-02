const {
  Image,
  MediaObject,
  SimpleResponse,
  Suggestions
} = require('actions-on-google')
const { get, sample } = require('lodash')
const moment = require('moment')
const fetch = require('superagent')

const admin = require('firebase-admin')
const db = admin.firestore()

const { getRandomRadioForChip } = require('../utils')

const EPISODES_URL = 'https://api.spreaker.com/v2/shows/2886866/episodes'
const VOCAZAP_URL = 'https://vocazap.voca.st'

const helpResponses = (conv, extra) => {
  const sampleWithExtra = samples => {
    let { text, speech } = extra || {}
    const unitSample = sample(samples)
    text = text ? `${text} ${unitSample.text}` : unitSample.text
    speech = speech
      ? `<speak>${speech} ${unitSample.speech}</speak>`
      : unitSample.speech
    return { text, speech }
  }

  conv.ask(
    new SimpleResponse(
      sampleWithExtra([
        {
          text:
            'Deux choses sont possibles : écouter le podcast Des Ondes Vocast' +
            ' ou bien générer un zapping radio avec le jeu Vocazap.' +
            ' Vous pouvez également me demander de quitter.',
          speech:
            'Deux choses sont possibles : écouter le podcast Des Ondes Vocast' +
            ' ou bien générer un zapping radio avec le jeu Vocazap.' +
            ' Vous pouvez également me demander de quitter.'
        },
        {
          text:
            'Avec Vocast et les assistants vocaux, vous pouvez écouter le podcast Des Ondes Vocast' +
            ' ou bien jouer au Vocazap, le générateur automatique de zappings radios !' +
            ' Que souhaitez-vous ?',
          speech:
            'Avec Vocast et les assistants vocaux, vous pouvez écouter le podcast Des Ondes Vocast' +
            ' ou bien jouer au Vocazap, le générateur automatique de zappings radios !' +
            ' Que souhaitez-vous ?'
        },
        {
          text:
            'On peut jouer ensemble au Vocazap.' +
            ' Ou alors vous pouvez lancer le podcast Des Ondes Vocast ! Que voulez-vous ?' +
            ' Dites "quitter" si vous ne voulez plus me parler.',
          speech:
            'On peut jouer ensemble au Vocazap.' +
            ' Ou alors vous pouvez lancer le podcast Des Ondes Vocast ! Que voulez-vous ?' +
            ' Dites quitter si vous ne voulez plus me parler.'
        },
        {
          text:
            'Avec cette appli conversationnelle,' +
            ' vous pouvez écouter le podcast Des Ondes Vocast' +
            ' ou générer des zappings radio en jouant au Vocazap !' +
            ' Que souhaitez-vous ?',
          speech:
            'Avec cette appli conversationnelle,' +
            ' vous pouvez écouter le podcast Des Ondes Vocast' +
            ' ou générer des zappings radio en jouant au Vocazap !' +
            ' Que souhaitez-vous ?'
        },
        {
          text:
            'Vous pouvez demander à diffuser un épisode Des Ondes Vocast' +
            ' ou bien générer un zapping radio, avec le Vocazap.' +
            " Vous pouvez également quitter à tout moment. C'est à vous ;)",
          speech:
            'Vous pouvez demander à diffuser un épisode Des Ondes Vocast' +
            ' ou bien générer un zapping radio, avec le Vocazap.' +
            " Vous pouvez également quitter à tout moment. C'est à vous."
        },
        {
          text:
            'Ensemble, nous pouvons écouter un podcast Des Ondes Vocast' +
            " ou bien jouer au Vocazap ! Qu'est-ce que vous ferait plaisir ?",
          speech:
            'Ensemble, nous pouvons écouter un podcast Des Ondes Vocast' +
            " ou bien jouer au Vocazap ! Qu'est-ce que vous ferait plaisir ?"
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

      // console.log({ selectedEpisode })

      if (episode_id) {
        conv.user.storage.played.episodes.push(episode_id)
        conv.user.storage.lastPlayed = {
          type: episode ? 'choice' : fullEpisode ? 'dov-full' : params.extraits,
          title,
          episode_id,
          media_id: episode_id
        }

        await db.runTransaction(t => {
          t.set(db.collection('dov_plays').doc(`${+new Date()}`), {
            date: new Date(),
            fullEpisode: !!fullEpisode,
            params: params || false,
            selectedEpisode: title || false,
            email: get(conv, 'user.storage.userInfos.email', false)
          })
          return Promise.resolve('Wrote in DB')
        })

        conv.ask(
          new SimpleResponse(
            sample([
              {
                text: `Je mets l'épisode ${title} du podcast Des Ondes Vocast`,
                speech:
                  '<speak>' +
                  `<audio src='https://storage.googleapis.com/agent-responses/podcast_resp_1.mp3'>` +
                  `Je mets l'épisode ${title.replace(/&/gi, 'et')} du podcast Des Ondes Vocast` +
                  '</audio>' +
                  '</speak>'
              },
              {
                text: `Voici l'épisode ${title} du podcast Des Ondes Vocast`,
                speech:
                  '<speak>' +
                  `<audio src='https://storage.googleapis.com/agent-responses/podcast_resp_2.mp3'>` +
                  `Voici l'épisode ${title.replace(/&/gi, 'et')} du podcast Des Ondes Vocast` +
                  '</audio></speak>'
              }
            ])
          )
        )
        conv.ask(
          new MediaObject({
            name: `${title} - Des Ondes Vocast`,
            url: `https://api.spreaker.com/v2/episodes/${episode_id}/play.mp3`,
            description: `Date de publication : ${moment(published_at)
              .locale('fr')
              .format('LLLL')}`,
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
      conv.ask(
        new Suggestions([
          'Suppr hist lecture',
          `Vocazap sur ${getRandomRadioForChip()}`,
          'Quitter'
        ])
      )
    })
  }
}

const suggestionsResponse = conv => {
  conv.ask(
    new Suggestions([
      `Vocazap sur ${getRandomRadioForChip()}`,
      'Liste épisodes'
    ])
  )
}

const vocazapResponse = (conv, radio) => {
  return fetch(VOCAZAP_URL).then(async r => {
    /**
    r.body = {
      date: '2019-01-05T15:23:35.151Z',
      zap: {
        id: 4089,
        zap_id: 1026,
        record_id: 14947,
        radio_id: 373,
        record_url:
          'https://storage.googleapis.com/vocazap-main-bucket/piges/Gold FM/18-12-15/Gold FM@sam. 18-12-15 02.mp3',
        timestamp: '2018-12-15T02:00:00.000Z',
        position: 1,
        timestamp_cursor: '2018-12-15T02:37:22.000Z',
        zap_url:
          'https://storage.googleapis.com/vocazap-main-bucket/zaps/18-12-31/1546226113114.mp3',
        zap_path: 'zaps/18-12-31/1546226113114.mp3',
        created_date: '2018-12-31T03:15:13.000Z',
        name: 'Gold FM',
        stream_url: 'http://mediam.streamakaci.com/goldfm.mp3'
      }
    }
    // */

    const { zap_id, zap_url, name } = r.body.zap

    if (!conv.user.storage.played) {
      conv.user.storage.played = { vocazaps: [], episodes: [] }
    }

    conv.user.storage.played.vocazaps.push(zap_id)
    conv.user.storage.lastPlayed = {
      type: 'vocazap',
      zap_id,
      zap_url,
      name,
      media_id: zap_id
    }

    if (radio) {
      conv.user.storage.vocaPlays = conv.user.storage.vocaPlays
        ? conv.user.storage.vocaPlays + 1
        : 1

      const winning = name.trim().toLowerCase() === radio.trim().toLowerCase()

      await db.runTransaction(t => {
        t.set(db.collection('vocazap').doc(`${+new Date()}`), {
          date: new Date(),
          email: get(conv, 'user.storage.userInfos.email', false),
          zap_radio: name || false,
          user_radio: radio || false,
          winning,
          nbPlays: get(conv, 'user.storage.vocaPlays', false)
        })
        return Promise.resolve('Wrote in DB')
      })

      if (winning) {
        conv.ask(
          `Vous avez lancé le Vocazap avec la radio ${radio}...` +
            ` Félicitations ! Vous avez deviné la bonne radio !` +
            ` Nous allons vous contacter par mail pour vous féliciter !`
        )
        console.error(
          'WOOOOOOOOOOON',
          conv.user.storage.userInfos.email,
          r.body.zap,
          radio
        )
      } else {
        conv.ask(
          sample([
            `Vous avez lancé le Vocazap avec la radio ${radio}.` +
              ` Le premier extrait du zap est issu de la radio ${name}...` +
              ` Vous avez perdu ! Mais vous pouvez retenter votre chance !`,
            `Vous avez perdu, ce n'est pas la radio ${radio} mais la radio ${name}` +
              ` qui est dans le premier extrait... Il faut avouer que ce n'est pas facile de trouver la bonne radio !` +
              ` Mais peut-être que vous allez y arriver au bout de plusieurs tentatives ! `,
            `Serait-ce donc la radio ${radio} sélectionnée pour le premier extrait du zap ? ` +
              ` Et bien non, vous avez perdu, c'est la radio ${name} !`
          ])
        )
      }
    }

    if (
      !conv.surface.capabilities.has('actions.capability.MEDIA_RESPONSE_AUDIO')
    ) {
      conv.ask(
        new SimpleResponse({
          speech:
            `<speak>` +
            `<audio src='https://storage.googleapis.com/agent-responses/play_vocazap.mp3'>` +
            `Et voici le Vocazap généré.</audio> ` +
            `<audio src="${zap_url}">[Vocazap]</audio>` +
            `</speak>`,
          text: 'Et voici le Vocazap généré.'
        })
      )
    } else {
      conv.ask(
        new SimpleResponse({
          speech:
            `<speak>` +
            `<audio src='https://storage.googleapis.com/agent-responses/play_vocazap.mp3'>` +
            `Et voici le Vocazap généré.</audio> ` +
            `</speak>`,
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
  const welcome = !conv.user.last.seen
    ? sample([
      {
        text: "Bienvenue dans l'univers Vocast.",
        speech:
            "<speak><audio src='https://storage.googleapis.com/agent-responses/welcome_new.mp3'>Bienvenue dans l'univers Vocast.</audio></speak>"
      }
    ])
    : sample([
      {
        text: "Ravi de vous accueillir de nouveau dans l'univers Vocast.",
        speech:
            "<audio src='https://storage.googleapis.com/agent-responses/welcome_r1.mp3'>Ravi de vous accueillir de nouveau dans l'univers Vocast.</audio>"
      },
      {
        text: "Bienvenue de nouveau dans l'univers de Vocast.",
        speech:
            "<audio src='https://storage.googleapis.com/agent-responses/welcome_r2.mp3'>Bienvenue de nouveau dans l'univers de Vocast.</audio>"
      },
      {
        text: "Nous sommes contents de vous revoir dans l'univers Vocast.",
        speech:
            "<audio src='https://storage.googleapis.com/agent-responses/welcome_r3.mp3'>Nous sommes contents de vous revoir dans l'univers Vocast.</audio>"
      }
    ])

  helpResponses(conv, welcome)
}

module.exports = {
  helpResponses,
  podcastResponse,
  suggestionsResponse,
  vocazapResponse,
  welcomeResponse
}
