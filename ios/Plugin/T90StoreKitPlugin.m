#import <Capacitor/Capacitor.h>

// Define the plugin using the Capacitor macro.
// Registered as "StoreKit" — accessible from JavaScript at:
//   window.Capacitor.Plugins.StoreKit
CAP_PLUGIN(T90StoreKitPlugin, "StoreKit",
    CAP_PLUGIN_METHOD(getProducts, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(restorePurchases, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(finishTransaction, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(openSubscriptionManagement, CAPPluginReturnPromise);
)