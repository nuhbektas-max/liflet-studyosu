using Aurora.Core;
using Xunit;

public class ConversationTurnTrackerTests
{
    [Fact]
    public void MeasuresLatencyFromInputToSpeech()
    {
        var t = new ConversationTurnTracker();
        t.NotifyUserInput(10);
        Assert.True(t.AwaitingResponse);
        t.NotifyResponseText(11.5);
        t.NotifySpeechStarted(12.25);
        Assert.False(t.AwaitingResponse);
        Assert.Equal(2.25, t.LastResponseLatency, 3);
    }

    [Fact]
    public void TimeoutWithoutTextReportsConnectionError()
    {
        var t = new ConversationTurnTracker { ResponseTimeoutSeconds = 5 };
        t.NotifyUserInput(0);
        t.Tick(4);
        Assert.Null(t.ErrorMessage);
        t.Tick(6);
        Assert.Contains("İnternet", t.ErrorMessage);
        Assert.False(t.AwaitingResponse);
    }

    [Fact]
    public void TimeoutAfterTextReportsTtsError()
    {
        var t = new ConversationTurnTracker { ResponseTimeoutSeconds = 5 };
        t.NotifyUserInput(0);
        t.NotifyResponseText(1);
        t.Tick(6);
        Assert.Contains("ses", t.ErrorMessage);
    }

    [Fact]
    public void NewInputClearsError()
    {
        var t = new ConversationTurnTracker();
        t.NotifyError("x", 0);
        t.NotifyUserInput(1);
        Assert.Null(t.ErrorMessage);
        Assert.True(t.AwaitingResponse);
    }

    [Fact]
    public void ErrorExpiresAfterDisplayTime()
    {
        var t = new ConversationTurnTracker { ErrorDisplaySeconds = 3 };
        t.NotifyError("Bağlantı yok", 10);
        t.Tick(12);
        Assert.Equal("Bağlantı yok", t.ErrorMessage);
        t.Tick(13);
        Assert.Null(t.ErrorMessage);
    }

    [Fact]
    public void TrackerAndMachineReturnToIdleAfterError()
    {
        var t = new ConversationTurnTracker { ResponseTimeoutSeconds = 5, ErrorDisplaySeconds = 3 };
        var sm = new RobotStateMachine { MinimumErrorSeconds = 3 };
        t.NotifyUserInput(0);
        for (double now = 0; now <= 12; now += 0.5)
        {
            t.Tick(now);
            sm.Update(new RobotSignals(false, false, t.AwaitingResponse, false, t.ErrorMessage), now);
            if (now == 2) Assert.Equal(RobotState.Thinking, sm.Current);
            if (now == 6) Assert.Equal(RobotState.Error, sm.Current);
        }
        Assert.Equal(RobotState.Idle, sm.Current);
    }

    [Fact]
    public void CancelStopsWaiting()
    {
        var t = new ConversationTurnTracker();
        t.NotifyUserInput(0);
        t.NotifyCancelled();
        t.Tick(1000);
        Assert.False(t.AwaitingResponse);
        Assert.Null(t.ErrorMessage);
    }
}
