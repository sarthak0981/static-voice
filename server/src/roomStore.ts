import { InternalRoom } from './roomManager.js';

/**
 * Storage abstraction allowing in-memory room management (default)
 * or Redis-backed state adapter for horizontal multi-server clusters.
 */
export interface RoomStore {
  get(roomId: string): InternalRoom | undefined;
  set(roomId: string, room: InternalRoom): void;
  delete(roomId: string): boolean;
  has(roomId: string): boolean;
  values(): IterableIterator<InternalRoom>;
  count(): number;
  clear(): void;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms: Map<string, InternalRoom> = new Map();

  public get(roomId: string): InternalRoom | undefined {
    return this.rooms.get(roomId);
  }

  public set(roomId: string, room: InternalRoom): void {
    this.rooms.set(roomId, room);
  }

  public delete(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  public has(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  public values(): IterableIterator<InternalRoom> {
    return this.rooms.values();
  }

  public count(): number {
    return this.rooms.size;
  }

  public clear(): void {
    this.rooms.clear();
  }
}
