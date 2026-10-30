let incognito = false;

export function isIncognitoOn(): boolean {
  return incognito;
}

export function setIncognitoOn(value: boolean): void {
  incognito = value;
}
