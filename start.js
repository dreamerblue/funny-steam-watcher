async function main() {
  const startDelay = process.env.START_DELAY ? +process.env.START_DELAY : 0;
  if (startDelay > 0) {
    console.log(`Ready to start after ${startDelay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, startDelay));
  }
  require('./steam');
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
