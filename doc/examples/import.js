// .hql-cache/1/doc/examples/import.ts
import * as chalkModule from "jsr:@nothing628/chalk@1.0.0";
import * as pathModule from "https://deno.land/std@0.170.0/path/mod.ts";
var chalk = function() {
  const wrapper = chalkModule.default !== void 0 ? chalkModule.default : {};
  for (const [key, value] of Object.entries(chalkModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
console.log(chalk.green("JSR import working!"));
var path = function() {
  const wrapper = pathModule.default !== void 0 ? pathModule.default : {};
  for (const [key, value] of Object.entries(pathModule)) {
    if (key !== "default")
      wrapper[key] = value;
  }
  return wrapper;
}();
var joined_path = path.join("folder", "file.txt");
console.log(chalk.green("HTTP import working! Path:", joined_path));
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLmhxbC1jYWNoZS8xL2RvYy9leGFtcGxlcy9pbXBvcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCAqIGFzIGNoYWxrTW9kdWxlIGZyb20gXCJqc3I6QG5vdGhpbmc2MjgvY2hhbGtAMS4wLjBcIjtcbmNvbnN0IGNoYWxrID0gKGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCB3cmFwcGVyID0gY2hhbGtNb2R1bGUuZGVmYXVsdCAhPT0gdW5kZWZpbmVkID8gY2hhbGtNb2R1bGUuZGVmYXVsdCA6IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGNoYWxrTW9kdWxlKSkge1xuICAgICAgICBpZiAoa2V5ICE9PSBcImRlZmF1bHRcIilcbiAgICAgICAgICAgIHdyYXBwZXJba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gd3JhcHBlcjtcbn0pKCk7XG5jb25zb2xlLmxvZyhjaGFsay5ncmVlbihcIkpTUiBpbXBvcnQgd29ya2luZyFcIikpO1xuaW1wb3J0ICogYXMgcGF0aE1vZHVsZSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQDAuMTcwLjAvcGF0aC9tb2QudHNcIjtcbmNvbnN0IHBhdGggPSAoZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IHdyYXBwZXIgPSBwYXRoTW9kdWxlLmRlZmF1bHQgIT09IHVuZGVmaW5lZCA/IHBhdGhNb2R1bGUuZGVmYXVsdCA6IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHBhdGhNb2R1bGUpKSB7XG4gICAgICAgIGlmIChrZXkgIT09IFwiZGVmYXVsdFwiKVxuICAgICAgICAgICAgd3JhcHBlcltrZXldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiB3cmFwcGVyO1xufSkoKTtcbmNvbnN0IGpvaW5lZF9wYXRoID0gcGF0aC5qb2luKFwiZm9sZGVyXCIsIFwiZmlsZS50eHRcIik7XG5jb25zb2xlLmxvZyhjaGFsay5ncmVlbihcIkhUVFAgaW1wb3J0IHdvcmtpbmchIFBhdGg6XCIsIGpvaW5lZF9wYXRoKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQUEsWUFBWSxpQkFBaUI7QUFVN0IsWUFBWSxnQkFBZ0I7QUFUNUIsSUFBTSxRQUFTLFdBQVk7QUFDdkIsUUFBTSxVQUFzQix3QkFBWSxTQUF3QixzQkFBVSxDQUFDO0FBQzNFLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsV0FBVyxHQUFHO0FBQ3BELFFBQUksUUFBUTtBQUNSLGNBQVEsR0FBRyxJQUFJO0FBQUEsRUFDdkI7QUFDQSxTQUFPO0FBQ1gsRUFBRztBQUNILFFBQVEsSUFBSSxNQUFNLE1BQU0scUJBQXFCLENBQUM7QUFFOUMsSUFBTSxPQUFRLFdBQVk7QUFDdEIsUUFBTSxVQUFxQix1QkFBWSxTQUF1QixxQkFBVSxDQUFDO0FBQ3pFLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsVUFBVSxHQUFHO0FBQ25ELFFBQUksUUFBUTtBQUNSLGNBQVEsR0FBRyxJQUFJO0FBQUEsRUFDdkI7QUFDQSxTQUFPO0FBQ1gsRUFBRztBQUNILElBQU0sY0FBYyxLQUFLLEtBQUssVUFBVSxVQUFVO0FBQ2xELFFBQVEsSUFBSSxNQUFNLE1BQU0sOEJBQThCLFdBQVcsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
