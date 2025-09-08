// .hql-cache/1/doc/examples/http.ts
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
import * as fileModule from "https://deno.land/std@0.170.0/fs/mod.ts";
var path = function() {
  const wrapper = pathModule.default !== void 0 ? pathModule.default : {};
  for (const [key, value] of Object.entries(pathModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var joined_path = path.join("folder", "file.txt");
var file = function() {
  const wrapper = fileModule.default !== void 0 ? fileModule.default : {};
  for (const [key, value] of Object.entries(fileModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var exists = file.existsSync("example-dir");
console.log("hello");
console.log(exists);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9odHRwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgKiBhcyBwYXRoTW9kdWxlIGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAMC4xNzAuMC9wYXRoL21vZC50c1wiO1xuY29uc3QgcGF0aCA9IChmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgd3JhcHBlciA9IHBhdGhNb2R1bGUuZGVmYXVsdCAhPT0gdW5kZWZpbmVkID8gcGF0aE1vZHVsZS5kZWZhdWx0IDoge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocGF0aE1vZHVsZSkpIHtcbiAgICAgICAgaWYgKGtleSAhPT0gXCJkZWZhdWx0XCIpXG4gICAgICAgICAgICB3cmFwcGVyW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHdyYXBwZXI7XG59KSgpO1xuY29uc3Qgam9pbmVkX3BhdGggPSBwYXRoLmpvaW4oXCJmb2xkZXJcIiwgXCJmaWxlLnR4dFwiKTtcbmltcG9ydCAqIGFzIGZpbGVNb2R1bGUgZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE3MC4wL2ZzL21vZC50c1wiO1xuY29uc3QgZmlsZSA9IChmdW5jdGlvbiAoKSB7XG4gICAgY29uc3Qgd3JhcHBlciA9IGZpbGVNb2R1bGUuZGVmYXVsdCAhPT0gdW5kZWZpbmVkID8gZmlsZU1vZHVsZS5kZWZhdWx0IDoge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZmlsZU1vZHVsZSkpIHtcbiAgICAgICAgaWYgKGtleSAhPT0gXCJkZWZhdWx0XCIpXG4gICAgICAgICAgICB3cmFwcGVyW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHdyYXBwZXI7XG59KSgpO1xuY29uc3QgZXhpc3RzID0gZmlsZS5leGlzdHNTeW5jKFwiZXhhbXBsZS1kaXJcIik7XG5jb25zb2xlLmxvZyhcImhlbGxvXCIpO1xuY29uc29sZS5sb2coZXhpc3RzKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBQSxZQUFZLGdCQUFnQjtBQVU1QixZQUFZLGdCQUFnQjtBQVQ1QixJQUFNLE9BQVEsV0FBWTtBQUN0QixRQUFNLFVBQXFCLHVCQUFZLFNBQXVCLHFCQUFVLENBQUM7QUFDekUsYUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxVQUFVLEdBQUc7QUFDbkQsUUFBSSxRQUFRO0FBQ1IsY0FBUSxHQUFHLElBQUk7QUFBQSxFQUN2QjtBQUNBLFNBQU87QUFDWCxFQUFHO0FBQ0gsSUFBTSxjQUFjLEtBQUssS0FBSyxVQUFVLFVBQVU7QUFFbEQsSUFBTSxPQUFRLFdBQVk7QUFDdEIsUUFBTSxVQUFxQix1QkFBWSxTQUF1QixxQkFBVSxDQUFDO0FBQ3pFLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsVUFBVSxHQUFHO0FBQ25ELFFBQUksUUFBUTtBQUNSLGNBQVEsR0FBRyxJQUFJO0FBQUEsRUFDdkI7QUFDQSxTQUFPO0FBQ1gsRUFBRztBQUNILElBQU0sU0FBUyxLQUFLLFdBQVcsYUFBYTtBQUM1QyxRQUFRLElBQUksT0FBTztBQUNuQixRQUFRLElBQUksTUFBTTsiLAogICJuYW1lcyI6IFtdCn0K
