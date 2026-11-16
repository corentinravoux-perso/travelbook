declare module 'mapshaper' {
  const mapshaper: {
    /** Run a mapshaper command line on in-memory inputs, resolve to the in-memory outputs. */
    applyCommands(
      commands: string,
      input?: Record<string, string | Uint8Array | object>,
    ): Promise<Record<string, string | Uint8Array>>;
  };
  export default mapshaper;
}
