export default defineVeerPlugin((veerApp) => {
  console.log('[plugin:hello] app:created', veerApp.config.public.apiBase)

  veerApp.hook('app:mounted', () => {
    console.log('[plugin:hello] app:mounted')
  })

  veerApp.hook('page:loading:start', () => console.log('[plugin:hello] page:loading:start'))
  veerApp.hook('page:loading:end', () => console.log('[plugin:hello] page:loading:end'))
})
