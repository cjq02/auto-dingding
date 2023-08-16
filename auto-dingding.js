/*
 * @Author: George Huan
 * @Date: 2020-08-03 09:30:30
 * @LastEditTime: 2022-03-26 10:56:25
 * @Description: DingDing-Automatic-Clock-in (Run on AutoJs)
 * @URL: https://github.com/georgehuan1994/DingDing-Automatic-Clock-in
 */

const ACCOUNT = "15080457802";
const PASSWORD = "FCU2nui_mqnr";

const QQ = "540807555";
const EMAILL_ADDRESS = "cjq02@qq.com";
const SERVER_CHAN = "Server酱发送密钥";
const PUSH_DEER = "PDU24737THr0Al9AKgMrwaP8qzONYyBnHJ1o8qQFU";

const PUSH_METHOD = { QQ: 1, Email: 2, ServerChan: 3, PushDeer: 4 };

// 默认通信方式：
// PUSH_METHOD.QQ -- QQ
// PUSH_METHOD.Email -- Email
// PUSH_METHOD.ServerChan -- Server酱
// PUSH_METHOD.PushDeer -- Push Deer
let DEFAULT_MESSAGE_DELIVER = PUSH_METHOD.PushDeer;

const PACKAGE_ID_QQ = "com.tencent.mobileqq"; // QQ
const PACKAGE_ID_DD = "com.alibaba.android.rimet"; // 钉钉
const PACKAGE_ID_XMSF = "com.xiaomi.xmsf"; // 小米推送服务
const PACKAGE_ID_TASKER = "net.dinglisch.android.taskerm"; // Tasker
const PACKAGE_ID_MAIL_163 = "com.netease.mail"; // 网易邮箱大师
const PACKAGE_ID_MAIL_ANDROID = "com.android.email"; // 系统内置邮箱
const PACKAGE_ID_PUSHDEER = "com.pushdeer.os"; // Push Deer
const PACKAGE_ID_DESKCLOCK = "com.android.deskclock";

const LOWER_BOUND = 1 * 60 * 1000; // 最小等待时间：1min
const UPPER_BOUND = 5 * 60 * 1000; // 最大等待时间：5min

// 执行时的屏幕亮度（0-255）, 需要"修改系统设置"权限
const SCREEN_BRIGHTNESS = 20;

// 是否过滤通知
const NOTIFICATIONS_FILTER = true;

// PackageId白名单
const PACKAGE_ID_WHITE_LIST = [
  PACKAGE_ID_QQ,
  PACKAGE_ID_DD,
  PACKAGE_ID_XMSF,
  PACKAGE_ID_MAIL_163,
  PACKAGE_ID_TASKER,
  PACKAGE_ID_PUSHDEER,
  PACKAGE_ID_DESKCLOCK,
];

// 公司的钉钉CorpId, 获取方法见 2020-09-24 更新日志。如果只加入了一家公司, 可以不填
const CORP_ID = "dingabb695a1633e13bc35c2f4657eb6378f";

// 锁屏意图, 配合 Tasker 完成锁屏动作, 具体配置方法见 2021-03-09 更新日志
const ACTION_LOCK_SCREEN = "autojs.intent.action.LOCK_SCREEN";

// 监听音量+键, 开启后无法通过音量+键调整音量, 按下音量+键：结束所有子线程
const OBSERVE_VOLUME_KEY = true;

const WEEK_DAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// =================== ↓↓↓ 主线程：监听通知 ↓↓↓ ====================

let currentDate = new Date();

// 是否暂停定时打卡
let suspend = false;

// 本次打开钉钉前是否需要等待
let needWaiting = true;

// 运行日志路径
let globalLogFilePath = "/sdcard/autojs/log/" + getCurrentDate() + "-log.txt";

let isScreenOn = false;

let curPackage = "";

let curActivity = "";

let battery = 0;

// 检查无障碍权限
auto.waitFor("normal");

// 检查Autojs版本
requiresAutojsVersion("4.1.0");

log(globalLogFilePath, files.exists(globalLogFilePath));

if (!files.exists(globalLogFilePath)) {
  const res = files.createWithDirs(globalLogFilePath);
  if (res) {
    log("创建日志文件成功.");
  } else {
    log("创建日志文件失败！");
  }
}

// 创建运行日志
console.setGlobalLogConfig({
  file: globalLogFilePath,
});

// 监听本机通知
events.observeNotification();
events.on("notification", function (n) {
  notificationHandler(n);
});

events.setKeyInterceptionEnabled("volume_up", OBSERVE_VOLUME_KEY);

if (OBSERVE_VOLUME_KEY) {
  events.observeKey();
}

// 监听音量+键
events.onKeyDown("volume_up", function (event) {
  threads.shutDownAll();
  device.setBrightnessMode(1);
  device.cancelKeepingAwake();
  toast("已中断所有子线程!");

  // 可以在此调试各个方法
  // doClock()
  // sendQQMsg("测试文本")
  // sendEmail("测试主题", "测试文本", null)
  // sendServerChan(测试主题, 测试文本)
  // sendPushDeer(测试主题, 测试文本)
});

toastLog("监听中, 请在日志中查看记录的通知及其内容");

// =================== ↑↑↑ 主线程：监听通知 ↑↑↑ =====================

/**
 * @description 处理通知
 */
function notificationHandler(n) {
  let packageId = n.getPackageName(); // 获取通知包名
  let abstract = n.tickerText; // 获取通知摘要
  let noticeText = n.getText(); // 获取通知文本
  console.log("监听", packageId, abstract, noticeText);
  // 过滤 PackageId 白名单之外的应用所发出的通知
  if (!filterNotification(packageId, abstract, noticeText)) {
    return;
  }

  // 监听摘要为 "定时打卡" 的通知, 不一定要从 Tasker 中发出通知, 日历、定时器等App均可实现
  if (abstract == "定时打卡" && !suspend) {
    needWaiting = true;
    threads.shutDownAll();
    threads.start(function () {
      doClock();
    });
    return;
  }

  // 监听钉钉返回的考勤结果
  if (packageId == PACKAGE_ID_DD && noticeText.indexOf("考勤打卡") >= 0) {
    setStorageData(
      "dingding",
      "clockResult",
      getCurrentDate() + " " + noticeText
    );
    threads.shutDownAll();
    threads.start(function () {
      sendKaoqinResult();
    });
    return;
  }

  switch (noticeText) {
    case "打卡": // 监听文本为 "打卡" 的通知
      needWaiting = false;
      threads.shutDownAll();
      threads.start(function () {
        doClock();
      });
      break;

    case "考勤结果": // 监听文本为 "查询" 的通知
      console.log("考勤结果");
      threads.shutDownAll();
      threads.start(function () {
        sendKaoqinResult();
      });
      break;
    case "设备查询":
    case "查询设备": {
      threads.shutDownAll();
      threads.start(function () {
        battery = device.getBattery();
        console.log("当前电量", battery);
        isScreenOn = device.isScreenOn();
        console.log("是否亮屏", isScreenOn);
        curPackage = currentPackage();
        curActivity = currentActivity();
        console.log("当前应用", curPackage, curActivity);
        sendPushDeer(
          "设备信息",
          "当前电量：" + battery + "，是否亮屏：" + isScreenOn + "，当前应用：" + curPackage + "，" + curActivity
        );
      });
      break;
    }
    case "亮屏": {
      threads.shutDownAll();
      threads.start(function () {
        console.log("正在唤醒设备");
        device.wakeUpIfNeeded();
        sleep(1000);
        isScreenOn = device.isScreenOn();
        console.log("是否亮屏", isScreenOn);
        sendPushDeer("唤醒设备", "是否亮屏：" + isScreenOn);
      });
      break;
    }
    case "熄屏": {
      threads.shutDownAll();
      threads.start(function () {
        home();
        sleep(1000);
        lockScreen();
        sleep(1000);
        isScreenOn = device.isScreenOn();
        curPackage = currentPackage();
        console.log("是否亮屏", isScreenOn);
        sendPushDeer(
          "熄屏",
          "是否亮屏：" + isScreenOn + "，当前应用：" + curPackage
        );
      });
      break;
    }
    case "当前应用": {
      threads.shutDownAll();
      threads.start(function () {
        curPackage = currentPackage();
        curActivity = currentActivity();
        console.log("当前应用", curPackage, curActivity);
        sendPushDeer("当前应用", curPackage + "，" + curActivity);
      });
      break;
    }
    case "返回桌面": {
      threads.shutDownAll();
      threads.start(function () {
        home();
        sleep(1000);
        curPackage = currentPackage();
        console.log("返回桌面成功，当前应用", curPackage);
        sendPushDeer(
          "返回桌面成功",
          "当前应用：" + curPackage + "，" + curActivity
        );
      });
      break;
    }
    case "打开钉钉": {
      threads.shutDownAll();
      threads.start(function () {
        device.wakeUpIfNeeded();
        const res = signIn();
        sendPushDeer("钉钉状态", res);
      });
      break;
    }
    case "最新结果": {
      threads.shutDownAll();
      threads.start(function () {
        device.wakeUpIfNeeded();
        signIn();
        attendKaoqin();
        let resultMessage = "";
        const list = className("android.view.View").find();
        for (let i = 0; i < list.length; i++) {
          if (
            list[i].getText() !== null &&
            list[i].getText().toString().indexOf("已打卡") > 0
          ) {
            resultMessage += list[i].getText().toString() + "。";
          }
        }
        if (resultMessage === "") {
          resultMessage += "无打卡记录";
        }
        console.log("最新结果", resultMessage);
        sendPushDeer("最新结果", resultMessage);
        sleep(1000);
        home();
        sleep(1000);
        lockScreen();
      });
      break;
    }
    case "暂停": // 监听文本为 "暂停" 的通知
      suspend = true;
      console.warn("暂停定时打卡");
      threads.shutDownAll();
      threads.start(function () {
        switch (DEFAULT_MESSAGE_DELIVER) {
          case PUSH_METHOD.QQ:
            sendQQMsg("修改成功, 已暂停定时打卡功能");
            break;
          case PUSH_METHOD.Email:
            sendEmail("修改成功", "已暂停定时打卡功能", null);
            break;
          case PUSH_METHOD.ServerChan:
            sendServerChan("修改成功", "已暂停定时打卡功能");
            break;
          case PUSH_METHOD.PushDeer:
            sendPushDeer("修改成功", "已暂停定时打卡功能");
            break;
        }
      });
      break;

    case "恢复": // 监听文本为 "恢复" 的通知
      suspend = false;
      console.warn("恢复定时打卡");
      threads.shutDownAll();
      threads.start(function () {
        switch (DEFAULT_MESSAGE_DELIVER) {
          case PUSH_METHOD.QQ:
            sendQQMsg("修改成功, 已恢复定时打卡功能");
            break;
          case PUSH_METHOD.Email:
            sendEmail("修改成功", "已恢复定时打卡功能", null);
            break;
          case PUSH_METHOD.ServerChan:
            sendServerChan("修改成功", "已恢复定时打卡功能");
            break;
          case PUSH_METHOD.PushDeer:
            sendPushDeer("修改成功", "已恢复定时打卡功能");
            break;
        }
      });
      break;

    case "日志": // 监听文本为 "日志" 的通知
      threads.shutDownAll();
      threads.start(function () {
        sendEmail("获取日志", globalLogFilePath, globalLogFilePath);
      });
      break;

    default:
      break;
  }
}

function sendKaoqinResult() {
  // 监听钉钉返回的考勤结果
  switch (DEFAULT_MESSAGE_DELIVER) {
    case PUSH_METHOD.QQ:
      sendQQMsg(getStorageData("dingding", "clockResult"));
      break;
    case PUSH_METHOD.Email:
      sendEmail(
        "考勤结果",
        getStorageData("dingding", "clockResult"),
        cameraFilePath
      );
      break;
    case PUSH_METHOD.ServerChan:
      sendServerChan("考勤结果", getStorageData("dingding", "clockResult"));
      break;
    case PUSH_METHOD.PushDeer:
      sendPushDeer("考勤结果", getStorageData("dingding", "clockResult"));
      break;
  }
}

/**
 * @description 打卡流程
 */
function doClock() {
  currentDate = new Date();
  console.log("本地时间: " + getCurrentDate() + " " + getCurrentTime());
  console.log("开始打卡流程!");

  // 唤醒屏幕
  brightScreen();
  // 解锁屏幕
  unlockScreen();
  // 随机等待
  holdOn();
  // 自动登录
  signIn();
  // 处理迟到
  /* handleLate();  */
  // 考勤打卡
  attendKaoqin();

  if (currentDate.getHours() < 18) {
    // 上班打卡
    clockIn();
  } else {
    // 下班打卡
    clockOut();
  }
  sleep(1000);
  home();
  lockScreen();
}

/**
 * @description 发送邮件流程
 * @param {string} title 邮件主题
 * @param {string} message 邮件正文
 * @param {string} attachFilePath 要发送的附件路径
 */
function sendEmail(title, message, attachFilePath) {
  console.log("开始发送邮件流程!");

  brightScreen(); // 唤醒屏幕
  unlockScreen(); // 解锁屏幕

  if (attachFilePath != null && files.exists(attachFilePath)) {
    console.info("attachFilePath", attachFilePath);
    app.sendEmail({
      email: [EMAILL_ADDRESS],
      subject: title,
      text: message,
      attachment: attachFilePath,
    });
  } else {
    console.error("没有attachFilePath", attachFilePath);
    try {
      app.sendEmail({
        email: [EMAILL_ADDRESS],
        subject: title,
        text: message,
      });
    } catch (e) {
      console.error("发送邮件失败", e);
    }
  }

  console.log("选择邮件应用");
  // waitForActivity("com.android.internal.app.ChooserActivity") // 等待选择应用界面弹窗出现, 如果设置了默认应用就注释掉

  let emailAppName = app.getAppName(PACKAGE_ID_MAIL_163);

  /* app.launchApp(emailAppName) */

  console.log("emailAppName", emailAppName);
  if (null != emailAppName) {
    if (null != textMatches(emailAppName).findOne(1000)) {
      btn_email = textMatches(emailAppName).findOnce().parent();
      btn_email.click();
    }
  } else {
    console.error("不存在应用: " + PACKAGE_ID_MAIL_163);
    return;
  }

  // 网易邮箱大师
  let versoin = getPackageVersion(PACKAGE_ID_MAIL_163);
  console.log("应用版本: " + versoin);
  let sp = versoin.split(".");
  if (sp[0] == 6) {
    // 网易邮箱大师 6
    waitForActivity("com.netease.mobimail.activity.MailComposeActivity");
    id("send").findOne().click();
  } else {
    // 网易邮箱大师 7
    waitForActivity(
      "com.netease.mobimail.module.mailcompose.MailComposeActivity"
    );
    let input_address = id("input").findOne();
    if (null == input_address.getText()) {
      input_address.setText(EMAILL_ADDRESS);
    }
    id("iv_arrow").findOne().click();
    sleep(1000);
    id("img_send_bg").findOne().click();
  }

  // 内置电子邮件
  // waitForActivity("com.kingsoft.mail.compose.ComposeActivity")
  // id("compose_send_btn").findOne().click()

  console.log("正在发送邮件...");

  home();
  sleep(2000);
  lockScreen(); // 关闭屏幕
}

/**
 * @description 发送QQ消息
 * @param {string} message 消息内容
 */
function sendQQMsg(message) {
  console.log("发送QQ消息");

  brightScreen(); // 唤醒屏幕
  unlockScreen(); // 解锁屏幕

  app.startActivity({
    action: "android.intent.action.VIEW",
    data: "mqq://im/chat?chat_type=wpa&version=1&src_type=web&uin=" + QQ,
    packageName: "com.tencent.mobileqq",
  });

  // waitForActivity("com.tencent.mobileqq.activity.SplashActivity")
  console.log(
    "QQ URL",
    "mqq://im/chat?chat_type=wpa&version=1&src_type=web&uin=" + QQ
  );

  console.log("QQ消息", message);

  id("input").findOne().setText(message);
  id("fun_btn").findOne().click();

  home();
  sleep(1000);
  lockScreen(); // 关闭屏幕
}

/**
 * @description ServerChan推送
 * @param {string} title 标题
 * @param {string} message 消息
 */
function sendServerChan(title, message) {
  console.log("向 ServerChan 发起推送请求");

  url = "https://sctapi.ftqq.com/" + SERVER_CHAN + ".send";

  res = http.post(encodeURI(url), {
    title: title,
    desp: message,
  });

  console.log(res);
  sleep(1000);
  lockScreen(); // 关闭屏幕
}

/**
 * @description PushDeer推送
 * @param {string} title 标题
 * @param {string} message 消息
 */
function sendPushDeer(title, message) {
  console.log("向 PushDeer 发起推送请求");

  url = "https://api2.pushdeer.com/message/push";

  res = http.post(encodeURI(url), {
    pushkey: PUSH_DEER,
    text: title,
    desp: message,
    type: "markdown",
  });

  console.log("PushDeer响应", res);
  sleep(1000);
}

/**
 * @description 唤醒设备
 */
function brightScreen() {
  console.log("唤醒设备");

  device.setBrightnessMode(0); // 手动亮度模式
  device.setBrightness(SCREEN_BRIGHTNESS);
  device.wakeUpIfNeeded(); // 唤醒设备
  device.keepScreenOn(); // 保持亮屏
  sleep(1000); // 等待屏幕亮起

  if (!device.isScreenOn()) {
    console.warn("设备未唤醒, 重试");
    device.wakeUpIfNeeded();
    brightScreen();
  } else {
    console.info("设备已唤醒");
  }
  sleep(1000);
}

/**
 * @description 解锁屏幕
 */
function unlockScreen() {
  console.log("解锁屏幕");

  if (isDeviceLocked()) {
    gesture(
      320, // 滑动时间：毫秒
      [
        device.width * 0.5, // 滑动起点 x 坐标：屏幕宽度的一半
        device.height * 0.9, // 滑动起点 y 坐标：距离屏幕底部 10% 的位置, 华为系统需要往上一些
      ],
      [
        device.width / 2, // 滑动终点 x 坐标：屏幕宽度的一半
        device.height * 0.1, // 滑动终点 y 坐标：距离屏幕顶部 10% 的位置
      ]
    );

    sleep(1000); // 等待解锁动画完成
    home();
    sleep(1000); // 等待返回动画完成
  }

  if (isDeviceLocked()) {
    console.error(
      "上滑解锁失败, 请按脚本中的注释调整 gesture(time, [x1,y1], [x2,y2]) 方法的参数!"
    );
    return;
  }
  console.info("屏幕已解锁");
}

/**
 * @description 随机等待
 */
function holdOn() {
  if (!needWaiting) {
    return;
  }

  let randomTime = random(LOWER_BOUND, UPPER_BOUND);
  toastLog(
    Math.floor(randomTime / 1000) +
      "秒后启动" +
      app.getAppName(PACKAGE_ID_DD) +
      "..."
  );
  sleep(randomTime);
}

/**
 * @description 启动并登陆钉钉
 */
function signIn() {
  if (currentPackage() !== "com.alibaba.android.rimet") {
    app.launchPackage(PACKAGE_ID_DD);
    console.log("正在启动" + app.getAppName(PACKAGE_ID_DD) + "...");

    setVolume(0); // 设备静音

    sleep(10000); // 等待钉钉启动
  } else {
    console.log("已打开钉钉");
  }
  let signInMsg = "";

  if (
    currentPackage() == PACKAGE_ID_DD &&
    currentActivity() == "com.alibaba.android.user.login.SignUpWithPwdActivity"
  ) {
    try {
      console.info("账号未登录");
      signInMsg += "账号未登录，正在重新登录。";

      let account = id("et_phone_input").findOne();
      account.setText(ACCOUNT);
      console.log("输入账号");

      let password = id("et_password").findOne();
      password.setText(PASSWORD);
      console.log("输入密码");

      let privacy = id("cb_privacy").findOne();
      privacy.click();
      console.log("同意隐私协议");

      let btn_login = id("btn_next").findOne();
      btn_login.click();
      console.log("正在登录...");
    } catch (e) {
      console.error("登录异常", e);
    }

    sleep(3000);
  }

  if (
    currentPackage() == PACKAGE_ID_DD &&
    currentActivity() != "com.alibaba.android.user.login.SignUpWithPwdActivity"
  ) {
    console.info("账号已登录");
    signInMsg += "账号已登录。";
    sleep(1000);
    return signInMsg;
  }
  return signInMsg + "账号登录失败！";
}

/**
 * @description 处理迟到打卡
 */
function handleLate() {
  if (null != textMatches("迟到打卡").clickable(true).findOne(1000)) {
    btn_late = textMatches("迟到打卡").clickable(true).findOnce();
    btn_late.click();
    console.warn("迟到打卡");
  }
  if (null != descMatches("迟到打卡").clickable(true).findOne(1000)) {
    btn_late = descMatches("迟到打卡").clickable(true).findOnce();
    btn_late.click();
    console.warn("迟到打卡");
  }
}

/**
 * @description 使用 URL Scheme 进入考勤界面
 */
function attendKaoqin() {
  if (currentActivity().indexOf("TheOneActivityMainTaskSwipe") > 0) {
    console.info("已进入考勤界面");
    return;
  }
  let url_scheme =
    "dingtalk://dingtalkclient/page/link?url=https://attend.dingtalk.com/attend/index.html";

  if (CORP_ID != "") {
    url_scheme = url_scheme + "?corpId=" + CORP_ID;
  }
  console.log("CORP_ID", url_scheme);

  let a = app.intent({
    action: "VIEW",
    data: url_scheme,
    //flags: [Intent.FLAG_ACTIVITY_NEW_TASK]
  });
  app.startActivity(a);
  console.log("正在进入考勤界面...");
  textContains("已进入考勤范围").waitFor();
  console.info("已进入考勤界面");
  sleep(1000);
}

/**
 * @description 上班打卡
 */
function clockIn() {
  console.log("上班打卡...");

  if (null != textContains("已打卡").findOne(1000)) {
    console.info("已打卡");
    toast("已打卡");
    home();
    sleep(1000);
    return;
  }

  console.log("等待连接到考勤机...");
  sleep(2000);

  if (null != textContains("未连接").findOne(1000)) {
    console.error("未连接考勤机, 重新进入考勤界面!");
    back();
    sleep(2000);
    attendKaoqin();
    return;
  }

  textContains("已进入考勤范围").waitFor();
  console.info("已连接考勤机");
  sleep(1000);

  if (null != textMatches("上班打卡").clickable(true).findOne(1000)) {
    btn_clockin = textMatches("上班打卡").clickable(true).findOnce();
    btn_clockin.click();
    console.log("按下打卡按钮");
  } else {
    click(device.width / 2, device.height * 0.56);
    console.log("点击打卡按钮坐标");
  }
  sleep(1000);
  // 处理迟到打卡
  // handleLate();
}

/**
 * @description 下班打卡
 */
function clockOut() {
  console.log("下班打卡...");
  console.log("等待连接到考勤机...");
  sleep(2000);

  if (null != textContains("未连接").findOne(1000)) {
    console.error("未连接考勤机, 重新进入考勤界面!");
    back();
    sleep(2000);
    attendKaoqin();
    return;
  }

  textContains("已连接").waitFor();
  console.info("已连接考勤机");
  sleep(1000);

  if (null != textMatches("下班打卡").clickable(true).findOne(1000)) {
    btn_clockout = textMatches("下班打卡").clickable(true).findOnce();
    btn_clockout.click();
    console.log("按下打卡按钮");
    sleep(1000);
  } else {
    click(device.width / 2, device.height * 0.56);
    console.log("点击打卡按钮坐标");
  }

  if (null != textContains("早退打卡").clickable(true).findOne(1000)) {
    className("android.widget.Button")
      .text("早退打卡")
      .clickable(true)
      .findOnce()
      .parent()
      .click();
    console.warn("早退打卡");
  }

  sleep(1000);
}

/**
 * @description 锁屏
 */
function lockScreen() {
  console.log("关闭屏幕");

  // 锁屏方案1：Root
  // Power()

  // 锁屏方案2：No Root
  // press(Math.floor(device.width / 2), Math.floor(device.height * 0.973), 1000) // 小米的快捷手势：长按Home键锁屏

  // 万能锁屏方案：向Tasker发送广播, 触发系统锁屏动作。配置方法见 2021-03-09 更新日志
  app.sendBroadcast({ action: ACTION_LOCK_SCREEN });

  device.setBrightnessMode(1); // 自动亮度模式
  device.cancelKeepingAwake(); // 取消设备常亮

  click("一键锁屏");

  sleep(1000);

  if (!device.isScreenOn()) {
    console.info("屏幕已关闭");
  } else {
    console.error("屏幕未关闭, 请尝试其他锁屏方案, 或等待屏幕自动关闭");
  }
}

// ===================== ↓↓↓ 功能函数 ↓↓↓ =======================

function dateDigitToString(num) {
  return num < 10 ? "0" + num : num;
}

function getCurrentTime() {
  let currentDate = new Date();
  let hours = dateDigitToString(currentDate.getHours());
  let minute = dateDigitToString(currentDate.getMinutes());
  let second = dateDigitToString(currentDate.getSeconds());
  let formattedTimeString = hours + ":" + minute + ":" + second;
  return formattedTimeString;
}

function getCurrentDate() {
  let currentDate = new Date();
  let year = dateDigitToString(currentDate.getFullYear());
  let month = dateDigitToString(currentDate.getMonth() + 1);
  let date = dateDigitToString(currentDate.getDate());
  let week = currentDate.getDay();
  let formattedDateString =
    year + "-" + month + "-" + date + "-" + WEEK_DAY[week];
  return formattedDateString;
}

// 通知过滤器
function filterNotification(bundleId, abstract, text) {
  let check = PACKAGE_ID_WHITE_LIST.some(function (item) {
    return bundleId == item;
  });
  if (!NOTIFICATIONS_FILTER || check) {
    console.verbose(bundleId);
    console.verbose(abstract);
    console.verbose(text);
    console.verbose("---------------------------");
    return true;
  } else {
    return false;
  }
}

// 保存本地数据
function setStorageData(name, key, value) {
  const storage = storages.create(name); // 创建storage对象
  storage.put(key, value);
}

// 读取本地数据
function getStorageData(name, key) {
  const storage = storages.create(name);
  if (storage.contains(key)) {
    return storage.get(key, "");
  }
  // 默认返回undefined
}

// 删除本地数据
function delStorageData(name, key) {
  const storage = storages.create(name);
  if (storage.contains(key)) {
    storage.remove(key);
  }
}

// 获取应用版本号
function getPackageVersion(bundleId) {
  importPackage(android.content);
  let pckMan = context.getPackageManager();
  let packageInfo = pckMan.getPackageInfo(bundleId, 0);
  return packageInfo.versionName;
}

// 屏幕是否为锁定状态
function isDeviceLocked() {
  importClass(android.app.KeyguardManager);
  importClass(android.content.Context);
  let km = context.getSystemService(Context.KEYGUARD_SERVICE);
  return km.isKeyguardLocked();
}

// 设置媒体和通知音量
function setVolume(volume) {
  device.setMusicVolume(volume);
  device.setNotificationVolume(volume);
  console.verbose("媒体音量:" + device.getMusicVolume());
  console.verbose("通知音量:" + device.getNotificationVolume());
}

//根据控件文字点击，如果点击失败，则说明打卡流程无法正常进行，结束脚本运行
function clickMessage(message) {
  var n = 3;
  var logo = false;
  while (n--) {
    if (click(message)) {
      logo = true;
      break;
    }
    sleep(3 * 1000);
  }
  if (logo == false) {
    console.error("点击" + message + "出错");
    exit();
  }
}
