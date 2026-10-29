export default defineVeerRouteMiddleware((to, from) => {
  console.log('[auth.global]', from.path, '->', to.path)
})