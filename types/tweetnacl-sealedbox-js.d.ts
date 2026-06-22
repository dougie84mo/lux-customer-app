// tweetnacl-sealedbox-js ships no type definitions. It implements libsodium's
// sealed boxes (`crypto_box_seal` / `crypto_box_seal_open`) on top of tweetnacl.
declare module 'tweetnacl-sealedbox-js' {
  const sealedbox: {
    /** Seal `message` for `recipientPublicKey`; returns `ephemeralPk || box`. */
    seal(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array;
    /** Open a sealed box with the recipient's keypair; null on failure. */
    open(
      sealed: Uint8Array,
      recipientPublicKey: Uint8Array,
      recipientSecretKey: Uint8Array,
    ): Uint8Array | null;
    readonly overheadLength: number;
  };
  export default sealedbox;
}
