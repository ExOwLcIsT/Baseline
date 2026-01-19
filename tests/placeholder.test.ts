describe("placeholder tests", () => {
  test("placeholder test 1", () => {
    expect(true).toBe(false);
  });

  test("placeholder test 2", () => {
    expect(("b" + "a" + +"a" + "a").toLowerCase()).toBe("banana");
  });
});
