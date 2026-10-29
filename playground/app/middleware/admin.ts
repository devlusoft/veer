export default defineVeerRouteMiddleware((to, from) => {
  console.log('[admin]', from.path, '->', to.path)
})