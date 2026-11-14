/**
 * Runs once when the server starts, before it takes a request. Checking the
 * configuration here makes a bad setting stop the server at start-up, not on
 * the first page a crew member opens.
 */
export async function register() {
  // Imported only in the Node.js runtime: the check uses APIs no other runtime has.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkStartup } = await import('./server/startup')
    checkStartup()
  }
}
