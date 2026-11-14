/** Thrown by document operations on an unknown id or a request the book structure forbids. */
export class OpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpError';
  }
}
