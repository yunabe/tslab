import { TaskQueue, TaskCanceledError } from "./util";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

describe("TaskQueue", () => {
  it("sequential", async () => {
    let queue = new TaskQueue();
    const lst: string[] = [];
    queue.add(async () => {
      await sleep(10);
      lst.push("A");
    });
    lst.push("a");
    queue.add(async () => {
      await sleep(5);
      lst.push("B");
    });
    lst.push("b");
    const ret = await queue.add(async () => {
      lst.push("C");
      return lst;
    });
    lst.push("c");
    expect(ret).toEqual(["a", "b", "A", "B", "C", "c"]);
  });

  it("canceled", async () => {
    let queue = new TaskQueue();
    const lst: string[] = [];
    let rootErr = new Error("root cause");
    let p0 = queue.add(async () => {
      await sleep(10);
      throw rootErr;
    });
    let p1 = queue.add(async () => {
      return 123;
    });
    let p2 = queue.add(async () => {
      return "hello";
    });

    try {
      await p0;
      fail("await p0 must fail.");
    } catch (e) {
      expect(e).toBe(rootErr);
    }
    let p1Err: any;
    try {
      await p1;
      fail("await p1 must fail.");
    } catch (e) {
      expect(e).toBeInstanceOf(TaskCanceledError);
      expect(e.reason).toBe(rootErr);
      expect(e.toString()).toEqual("TaskCanceledError: Error: root cause");
      p1Err = e;
    }
    try {
      await p2;
      fail("await p2 must fail.");
    } catch (e) {
      expect(e).toBe(p1Err);
    }
  });
});
