import dns from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

// The r4spi cluster's CoreDNS answers every AAAA query with NXDOMAIN
// (deliberate, cluster-wide IPv4-only policy - see coredns-config in
// jyje/cluster). Alpine's musl libc getaddrinfo() treats an NXDOMAIN on
// *either* record type as "this hostname doesn't exist" and aborts the
// whole dual-stack lookup instead of falling back to the A record, so
// Node's default dns.lookup() (and therefore the global fetch()) fails
// every external HTTPS call with ENOTFOUND - even for real hosts like
// google.com. dns.resolve4() bypasses getaddrinfo entirely and works
// fine; this wires that in as fetch's DNS resolver.
//
// Scoped to this app's own outbound calls only - not a CoreDNS change,
// which the rest of the cluster's production services also depend on.
//
// Must implement the full net.Socket "custom lookup" contract, not just
// the common (err, address, family) shape: Node calls this with
// options.all === true in some paths (notably undici's own internal
// connection logic), and then expects (err, [{address, family}, ...])
// instead. Getting this wrong doesn't throw where you'd notice - it
// surfaces later as a confusing "Invalid IP address: undefined" deep in
// net.js, which is what happened here before this fix.
// `any` params: matches Node's own loosely-typed net.LookupFunction
// contract (the two call shapes below), not worth fighting the type
// checker for an internal helper only called by undici itself.
function ipv4Lookup(hostname: string, options: any, callback: any) {
  const opts = typeof options === "function" ? {} : options;
  const cb = typeof options === "function" ? options : callback;

  dns.resolve4(hostname, (err, addresses) => {
    if (err || !addresses || addresses.length === 0) {
      cb(err ?? new Error(`no A record for ${hostname}`));
      return;
    }
    if (opts?.all) {
      cb(
        null,
        addresses.map((address) => ({ address, family: 4 })),
      );
    } else {
      cb(null, addresses[0], 4);
    }
  });
}

setGlobalDispatcher(new Agent({ connect: { lookup: ipv4Lookup } }));
