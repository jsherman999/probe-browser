import { LocalGameController } from './LocalGameController';

let controller: LocalGameController | null = null;

export function setController(c: LocalGameController): void {
  if (controller && controller !== c) {
    controller.dispose();
  }
  controller = c;
}

export function getController(): LocalGameController | null {
  return controller;
}

export function clearController(): void {
  if (controller) {
    controller.dispose();
    controller = null;
  }
}
